import { createServerClient } from "@/lib/supabase";
import { assignTaskOwner, calculateTaskPriority } from "./task-engine";
import { sendMetaTemplate, sendWhatsApp, personaliseTemplate, getTemplateVariables } from "./whatsapp";
import { sendGmail } from "./gmail";
import { getSystemSettings } from "./server-settings";

const supabase = createServerClient();

export type WorkflowTrigger = "order_placed" | "order_delivered" | "order_rto" | "cart_abandoned" | "customer_tag_added" | "order_in_transit" | "customer_created" | "delivery_attempt_failed" | "out_for_delivery" | "stale_shipment" | "final_followup";

/**
 * WorkflowEngine - The stateful execution hub for CureForever CRM.
 */
export class WorkflowEngine {
  
  /**
   * Main entry point when an external event occurs
   */
  static async trigger(trigger: WorkflowTrigger, payload: any) {
    const customerId = payload.customer_id;
    if (!customerId) return;

    // Every downstream lookup (settings, workflows, task assignment) needs
    // to know which tenant this is - resolved once here from the customer
    // row rather than requiring every one of this method's many callers
    // (webhooks, crons, tasks/attempt) to pass it through explicitly.
    const { data: customerOrgRow } = await supabase.from("customers").select("org_id").eq("id", customerId).maybeSingle();
    const orgId = customerOrgRow?.org_id;
    if (!orgId) {
      console.error(`⚡ Workflow Engine: could not resolve an organization for customer ${customerId}, skipping trigger ${trigger}.`);
      return;
    }

    console.log(`⚡ Workflow Engine Triggered: ${trigger} for customer ${customerId}`);

    if (trigger === "order_rto") {
      const { data: customer } = await supabase.from("customers").select("rto_count, segment").eq("id", customerId).single();
      if (customer) {
        const newCount = (customer.rto_count || 0) + 1;
        const updates: any = { rto_count: newCount, rto_flag: true };
        
        if (newCount >= 2) {
          updates.segment = "risky";
        }
        
        await supabase.from("customers").update(updates).eq("id", customerId);
        console.log(`🚨 RTO Profiling: Customer ${customerId} count incremented to ${newCount}. Segment: ${updates.segment || customer.segment}`);
      }

      // [HARDENING] Clear Ghost Tasks: Cancel any pending tasks for this order immediately
      if (payload.order_id) {
        const { error: cleanupError } = await supabase
          .from("tasks")
          .update({ 
            status: "cancelled", 
            completed_at: new Date().toISOString() 
          })
          .eq("order_id", payload.order_id)
          .not("status", "in", '("done","cancelled","skipped")');
        
        if (!cleanupError) {
          console.log(`🧹 Ghost Task Cleanup: Cancelled pending tasks for RTO/Cancelled order ${payload.order_id}`);
        }
      }
    }
    try {
      await this.processSystemAutomation(trigger, payload, orgId);
    } catch (err: any) {
      console.error("❌ System Automation Error:", err.message);
    }

    // 1. Find active workflows for this trigger
    const { data: workflows } = await supabase
      .from("workflows")
      .select("*, workflow_steps(*)")
      .eq("trigger_event", trigger)
      .eq("is_active", true)
      .eq("org_id", orgId)
      .order("step_order", { foreignTable: "workflow_steps", ascending: true });

    if (!workflows || workflows.length === 0) return;

    // [NEW] Negative Feedback Suppression
    // Skip any non-critical triggers if there's an active issue_resolution task
    const criticalTriggers: WorkflowTrigger[] = ["order_rto", "delivery_attempt_failed", "stale_shipment"];
    if (!criticalTriggers.includes(trigger)) {
      const { count: issueCount } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customerId)
        .eq("task_type", "issue_resolution")
        .not("status", "in", '("done","cancelled","skipped")');

      if ((issueCount || 0) > 0) {
        console.log(`🛡️ Negative Feedback Suppression: Skipping '${trigger}' for customer ${customerId} due to active issue task.`);
        return;
      }
    }

    for (const workflow of workflows) {
      // 2. Campaign Isolation: Prevent redundant customer engagements
      // Check for ANY active instance of THIS specific workflow for this order or customer
      const isolationQuery = supabase
        .from("workflow_instances")
        .select("id")
        .eq("workflow_id", workflow.id)
        .eq("org_id", orgId)
        .eq("status", "active");
      
      if (payload.order_id) {
        isolationQuery.eq("order_id", payload.order_id);
      } else {
        isolationQuery.eq("customer_id", customerId);
      }

      const { data: existing } = await isolationQuery.maybeSingle();

      if (existing) {
        console.log(`⚠️ Isolation: Active instance of '${workflow.name}' already exists. Skipping.`);
        continue;
      }

      // 3. Start a new instance
      const steps = workflow.workflow_steps || [];
      if (steps.length === 0) continue;

      const firstStep = steps[0];
      
      // Calculate next_run_at: If first step is delay, schedule it. 
      // Otherwise, run immediately.
      let nextRunAt = new Date();
      if (firstStep.type === "delay") {
        const days = firstStep.params?.delay_days || 0;
        nextRunAt.setDate(nextRunAt.getDate() + days);
      }

      await supabase.from("workflow_instances").insert({
        org_id: orgId,
        workflow_id: workflow.id,
        customer_id: customerId,
        order_id: payload.order_id || null,
        current_step_id: firstStep.id,
        next_run_at: nextRunAt.toISOString(),
        status: "active"
      });

      // Refresh health scores periodically. Optional - skip quietly if the
      // function isn't present (phase-5 migration not applied).
      const { error: hsErr } = await supabase.rpc('refresh_customer_health_scores');
      if (hsErr) console.warn('health-score refresh skipped:', hsErr.message);

      console.log(`✅ Started Workflow '${workflow.name}' for customer ${customerId}. Next step: ${firstStep.type} at ${nextRunAt.toISOString()}`);
    }
  }

  /**
   * Processes a single step for an instance
   * Called by the background cron.
   */
  static async executeStep(instance: any) {
    const supabase = createServerClient();

    // workflow_instances carries its own org_id (Phase 1 retrofit), set
    // when trigger() created this instance - resolve it defensively from
    // the customer if an older row somehow predates that column being set.
    let orgId = instance.org_id;
    if (!orgId) {
      const { data: customerOrgRow } = await supabase.from("customers").select("org_id").eq("id", instance.customer_id).maybeSingle();
      orgId = customerOrgRow?.org_id;
    }
    if (!orgId) {
      console.error(`⚙️ Workflow Executor: could not resolve an organization for instance ${instance.id}, skipping.`);
      return;
    }

    // 1. Fetch step details
    const { data: step } = await supabase
      .from("workflow_steps")
      .select("*")
      .eq("id", instance.current_step_id)
      .single();

    if (!step) {
      await this.completeInstance(instance, "step_not_found");
      return;
    }

    console.log(`⚙️ Executing Step: ${step.type} [${step.id}] for Customer ${instance.customer_id}`);

    try {
      // 2. Perform Action
      switch (step.type) {
        case "message":
          // 5.1 Inventory Check (Feature 10)
          const { data: override } = await supabase
            .from("product_overrides")
            .select("inventory_quantity")
            .eq("shopify_product_id", instance.metadata?.product_id)
            .eq("org_id", orgId)
            .single();

          if (override && override.inventory_quantity <= 0) {
             console.log(`[WORKFLOW] Step skipped: Product ${instance.metadata?.product_id} out of stock.`);
             await this.logAction(instance.id, step.id, "skipped", `Inventory 0 for product ${instance.metadata?.product_id}`, {}, orgId);

             // Move to next step or complete
             await supabase.from("workflow_instances").update({
               current_step_id: null,
               status: "completed",
               updated_at: new Date().toISOString()
             }).eq("id", instance.id);
             return;
          }

          await this.handleMessageAction(step, instance, orgId);
          break;
        case "task":
          await this.handleTaskAction(step, instance, orgId);
          break;
        case "delay":
          // Delays are "passive" steps handled by nextRunAt calculation
          break;
      }

      // 3. Find Next Step
      const { data: nextStep } = await supabase
        .from("workflow_steps")
        .select("id, type, params")
        .eq("workflow_id", instance.workflow_id)
        .eq("step_order", step.step_order + 1)
        .maybeSingle();

      if (nextStep) {
        // Advance to next step
        let nextRun = new Date();
        if (nextStep.type === "delay") {
          const days = nextStep.params?.delay_days || 0;
          const hours = nextStep.params?.delay_hours || 0;
          nextRun.setDate(nextRun.getDate() + days);
          nextRun.setHours(nextRun.getHours() + hours);
        }

        await supabase.from("workflow_instances").update({
          current_step_id: nextStep.id,
          next_run_at: nextRun.toISOString()
        }).eq("id", instance.id);

        await this.logAction(instance.id, step.id, step.type, "processed", {}, orgId);
      } else {
        // No more steps: Complete
        await this.completeInstance(instance, "completed");
      }

    } catch (err: any) {
      console.error(`❌ Step Execution Error [${step.id}]:`, err.message);
      await this.logAction(instance.id, step.id, step.type, "failed", { error: err.message }, orgId);
    }
  }

  private static async handleMessageAction(step: any, instance: any, orgId: string) {
    const settings = await getSystemSettings(supabase, orgId);
    if (!settings?.whatsapp_enabled) {
      console.log(`[WORKFLOW] Message action skipped: WhatsApp disabled globally.`);
      return;
    }

    const { data: customer } = await supabase.from("customers").select("*").eq("id", instance.customer_id).single();
    if (!customer) throw new Error("Customer not found for message");

    const { data: order } = instance.order_id 
      ? await supabase.from("orders").select("*").eq("id", instance.order_id).single()
      : { data: null };
    
    const { data: cart } = instance.abandoned_cart_id
      ? await supabase.from("abandoned_carts").select("*").eq("id", instance.abandoned_cart_id).single()
      : { data: null };

    // [Self-Healing] Suppression: Skip messages if an active issue task exists
    const { count: issueCount } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", instance.customer_id)
      .eq("task_type", "issue_resolution")
      .not("status", "in", '("done","cancelled","skipped")');

    if ((issueCount || 0) > 0) {
      console.log(`🛡️ Message Suppression: Skipping step for customer ${instance.customer_id} due to active issue.`);
      return;
    }

    const { message_text, template_name } = step.params || {};
    const variables = getTemplateVariables(customer, order, cart);

    if (message_text) {
       // Personalise custom text
       const personalised = personaliseTemplate(message_text, variables);
       const res = await sendWhatsApp(customer.phone, personalised);
       if (!res.ok) throw new Error(res.error || "WhatsApp custom message failed");
    } else {
       const templateName = template_name || "Review Reminder";
       const res = await sendMetaTemplate(customer.phone, templateName, variables);
       if (!res.ok) throw new Error(res.error || "WhatsApp template send failed");
    }
  }

  private static async handleTaskAction(step: any, instance: any, orgId: string) {
    const { task_type, priority_bonus = 0 } = step.params;

    // Fetch customer segment for strict assignment enforcement
    const { data: customer } = await supabase.from("customers").select("segment").eq("id", instance.customer_id).single();
    const segment = customer?.segment;

    // Check for product-specific priority overrides
    let isPriorityOverride = false;
    if (instance.order_id) {
       const { data: order } = await supabase.from("orders").select("line_items").eq("id", instance.order_id).single();
       const productId = order?.line_items?.[0]?.product_id;
       if (productId) {
          const { data: ov } = await supabase.from("product_overrides").select("is_priority").eq("shopify_product_id", productId).eq("org_id", orgId).single();
          isPriorityOverride = ov?.is_priority || false;
       }
    }

    await supabase.from("tasks").upsert({
      org_id: orgId,
      customer_id: instance.customer_id,
      order_id: instance.order_id,
      task_type: task_type || "follow_up",
      due_date: new Date().toISOString().split("T")[0],
      assigned_to: await assignTaskOwner(supabase, task_type, segment),
      priority_score: 50 + (priority_bonus || 0) + (isPriorityOverride ? 50 : 0),
      status: "pending"
    }, { onConflict: "order_id, task_type" });
  }

  private static async logAction(instanceId: string, stepId: string, actionType: string, status: string, payload: any = {}, orgId?: string) {
    await supabase.from("workflow_logs").insert({
      org_id: orgId,
      instance_id: instanceId,
      step_id: stepId,
      action_type: actionType,
      status: status,
      payload: payload
    });
  }

  /**
   * Universal System Automation
   * Checks settings flags and sends immediate WhatsApp messages if enabled.
   */
  private static async processSystemAutomation(trigger: WorkflowTrigger, payload: any, orgId: string) {
    const settings = await getSystemSettings(supabase, orgId);
    if (!settings || !settings.whatsapp_enabled) return;

    let flag = false;
    let template = "";
    
    switch (trigger) {
      case "order_placed":
        // [HARDENING] Dedup: Don't send order_placed message if already sent within last 1 hour
        const { data: recent } = await supabase
          .from("webhook_logs")
          .select("id")
          .eq("topic", trigger)
          .eq("status", "processed")
          .eq("org_id", orgId)
          .filter("payload->>order_id", "eq", payload.order_id)
          .gte("created_at", new Date(Date.now() - 3600000).toISOString())
          .maybeSingle();
        
        if (recent) {
          console.log(`🛡️ Automation Hardening: Skipping '${trigger}' for order ${payload.order_id} - already processed.`);
          return;
        }

        flag = settings.wa_auto_order_placed;
        template = settings.wa_order_placed_template;
        break;
      case "order_in_transit":
        flag = settings.wa_auto_order_transit;
        template = settings.wa_order_transit_template;
        break;
      case "order_delivered":
        flag = settings.wa_auto_order_delivered;
        template = settings.wa_order_delivered_template;
        break;
      case "cart_abandoned":
        flag = settings.wa_auto_cart_abandoned;
        template = settings.wa_cart_abandoned_template;
        break;
      case "customer_created":
        flag = settings.wa_auto_welcome;
        template = settings.wa_welcome_template;
        break;
      case "final_followup":
        flag = settings.wa_auto_final_followup;
        template = settings.wa_final_followup_template;
        break;
      case "out_for_delivery":
        flag = settings.wa_auto_out_for_delivery;
        template = settings.wa_out_for_delivery_template;
        break;
      case "delivery_attempt_failed":
        flag = settings.wa_auto_delivery_failed;
        template = settings.wa_delivery_failed_template;
        break;
      case "stale_shipment":
        flag = settings.wa_auto_stale_shipment;
        template = settings.wa_stale_shipment_template;
        break;
    }

    if (flag && template) {
      const { data: customer } = await supabase.from("customers").select("*").eq("id", payload.customer_id).single();
      if (!customer?.phone) return;

      // Prepare Variables
      const variables: any = {
        name: customer.name || "there",
        order_no: payload.order_id || "your order",
      };

      // Enrich with order data if available
      if (payload.order_id) {
        const { data: order } = await supabase.from("orders").select("*").eq("id", payload.order_id).maybeSingle();
        if (order) {
           variables.order_no = order.order_number || order.shopify_order_id || variables.order_no;
           variables.tracking_link = order.tracking_number ? `https://shiprocket.co/tracking/${order.tracking_number}` : "";
           variables.product = order.line_items?.[0]?.name || order.line_items?.[0]?.title || "your items";
        }
      }

      // Check for Negative Feedback / active complaints before sending review
      if (trigger === "order_delivered") {
        const { count: issueCount } = await supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("customer_id", payload.customer_id)
          .eq("task_type", "issue_resolution")
          .not("status", "in", '("done","cancelled","skipped")');
        
        if ((issueCount || 0) > 0) {
          console.log(`[WORKFLOW] Review skipped for customer ${payload.customer_id} due to active issue task.`);
          return;
        }
      }

      const message = personaliseTemplate(template, variables);
      console.log(`🤖 Auto-WhatsApp: Sending '${trigger}' message to ${customer.phone}`);
      
      const res = await sendWhatsApp(customer.phone, message);
      if (!res.ok) {
        console.error(`❌ Auto-WhatsApp Failed: ${res.error}`);
      }
    }

    // --- Branded Email Automations ---
    if (settings.gmail_refresh_token) {
      let emailFlag = false;
      let emailSubject = "";
      let emailTemplate = "";

      switch (trigger) {
        case "customer_created":
          emailFlag = settings.email_auto_welcome;
          emailSubject = settings.email_welcome_subject;
          emailTemplate = settings.email_welcome_template;
          break;
        case "order_placed":
          emailFlag = settings.email_auto_order_placed;
          emailSubject = settings.email_order_placed_subject;
          emailTemplate = settings.email_order_placed_template;
          break;
        case "order_in_transit":
          emailFlag = settings.email_auto_order_transit;
          emailSubject = settings.email_order_transit_subject;
          emailTemplate = settings.email_order_transit_template;
          break;
        case "order_delivered":
          emailFlag = settings.email_auto_order_delivered;
          emailSubject = settings.email_order_delivered_subject;
          emailTemplate = settings.email_order_delivered_template;
          break;
        case "cart_abandoned":
          emailFlag = settings.email_auto_cart_abandoned;
          emailSubject = settings.email_cart_abandoned_subject;
          emailTemplate = settings.email_cart_abandoned_template;
          break;
      }

      if (emailFlag && emailTemplate && emailSubject) {
        const { data: customer } = await supabase.from("customers").select("*").eq("id", payload.customer_id).single();
        if (customer?.email) {
          const { data: order } = payload.order_id 
            ? await supabase.from("orders").select("*").eq("id", payload.order_id).maybeSingle()
            : { data: null };
          
          const { data: cart } = payload.abandoned_cart_id
            ? await supabase.from("abandoned_carts").select("*").eq("id", payload.abandoned_cart_id).maybeSingle()
            : { data: null };

          const variables = getTemplateVariables(customer, order, cart);
          const personalisedSubject = personaliseTemplate(emailSubject, variables);
          const personalisedBody = personaliseTemplate(emailTemplate, variables);

          console.log(`📧 Auto-Email: Sending '${trigger}' branded email to ${customer.email}`);
          try {
            await sendGmail({ to: customer.email, subject: personalisedSubject, body: personalisedBody, orgId });
          } catch (err: any) {
            console.error(`❌ Auto-Email Failed: ${err.message}`);
          }
        }
      }
    }
  }

  private static async completeInstance(instance: any, status: string) {
    await supabase.from("workflow_instances").update({
      // workflow_instances.status is varchar(20) - clamp so a long status
      // string can never 22001 and wedge the executor on this instance.
      status: (status || "completed").slice(0, 20),
      next_run_at: new Date(Date.now() + 1000 * 3600 * 24 * 365 * 10).toISOString() // Far future
    }).eq("id", instance.id);
  }
}
