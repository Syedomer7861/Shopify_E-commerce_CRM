import { createClient } from "@supabase/supabase-js";
import { assignTaskOwner, calculateTaskPriority } from "./task-engine";
import { sendMetaTemplate, sendWhatsApp, personaliseTemplate } from "./whatsapp";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    console.log(`⚡ Workflow Engine Triggered: ${trigger} for customer ${customerId}`);

    // [NEW] RTO Profiling & Recovery (Feature 7 / Issue Resolution)
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
    }
    try {
      await this.processSystemAutomation(trigger, payload);
    } catch (err: any) {
      console.error("❌ System Automation Error:", err.message);
    }

    // 1. Find active workflows for this trigger
    const { data: workflows } = await supabase
      .from("workflows")
      .select("*, workflow_steps(*)")
      .eq("trigger_event", trigger)
      .eq("is_active", true)
      .order("step_order", { foreignTable: "workflow_steps", ascending: true });

    if (!workflows || workflows.length === 0) return;

    for (const workflow of workflows) {
      // 2. Prevent duplicate active instances for this order (Isolation)
      // Follow-up workflows should not overlap for the same order
      if (payload.order_id) {
        const { data: anyExisting } = await supabase
          .from("workflow_instances")
          .select("id")
          .eq("order_id", payload.order_id)
          .eq("status", "active")
          .maybeSingle();

        if (anyExisting) {
          console.log(`⚠️ Order ${payload.order_id} already has an active workflow instance. Skipping '${workflow.name}'.`);
          continue;
        }
      } else {
        // Fallback: Prevent duplicate active instances of the same workflow for this customer (e.g. for non-order triggers)
        const { data: existing } = await supabase
          .from("workflow_instances")
          .select("id")
          .eq("workflow_id", workflow.id)
          .eq("customer_id", customerId)
          .eq("status", "active")
          .maybeSingle();

        if (existing) {
          console.log(`⚠️ Customer ${customerId} already has an active instance of '${workflow.name}'. Skipping.`);
          continue;
        }
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
        workflow_id: workflow.id,
        customer_id: customerId,
        order_id: payload.order_id || null,
        current_step_id: firstStep.id,
        next_run_at: nextRunAt.toISOString(),
        status: "active"
      });

      // Refresh health scores periodically
      await supabase.rpc('refresh_customer_health_scores');

      console.log(`✅ Started Workflow '${workflow.name}' for customer ${customerId}. Next step: ${firstStep.type} at ${nextRunAt.toISOString()}`);
    }
  }

  /**
   * Processes a single step for an instance
   * Called by the background cron.
   */
  static async executeStep(instance: any) {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    
    // 1. Fetch step details
    const { data: step } = await supabase
      .from("workflow_steps")
      .select("*")
      .eq("id", instance.current_step_id)
      .single();

    if (!step) {
      await this.completeInstance(instance, "error: step_not_found");
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
            .single();
          
          if (override && override.inventory_quantity <= 0) {
             console.log(`[WORKFLOW] Step skipped: Product ${instance.metadata?.product_id} out of stock.`);
             await this.logAction(instance.id, step.id, "skipped", `Inventory 0 for product ${instance.metadata?.product_id}`);
             
             // Move to next step or complete
             await supabase.from("workflow_instances").update({
               current_step_id: null,
               status: "completed",
               updated_at: new Date().toISOString()
             }).eq("id", instance.id);
             return;
          }

          await this.handleMessageAction(step, instance);
          break;
        case "task":
          await this.handleTaskAction(step, instance);
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

        await this.logAction(instance.id, step.id, step.type, "processed");
      } else {
        // No more steps: Complete
        await this.completeInstance(instance, "completed");
      }

    } catch (err: any) {
      console.error(`❌ Step Execution Error [${step.id}]:`, err.message);
      await this.logAction(instance.id, step.id, step.type, "failed", { error: err.message });
    }
  }

  private static async handleMessageAction(step: any, instance: any) {
    const { data: customer } = await supabase.from("customers").select("phone, name").eq("id", instance.customer_id).single();
    if (!customer) throw new Error("Customer not found for message");

    const templateName = step.params?.template_name || "Review Reminder";
    // For cloud templates, we use the customer data as the mapping base
    const res = await sendMetaTemplate(customer.phone, templateName, { name: customer.name });
    if (!res.ok) throw new Error(res.error || "WhatsApp template send failed");
  }

  private static async handleTaskAction(step: any, instance: any) {
    const { task_type, priority_bonus = 0 } = step.params;
    
    // Check for product-specific priority overrides
    let isPriorityOverride = false;
    if (instance.order_id) {
       const { data: order } = await supabase.from("orders").select("line_items").eq("id", instance.order_id).single();
       const productId = order?.line_items?.[0]?.product_id;
       if (productId) {
          const { data: ov } = await supabase.from("product_overrides").select("is_priority").eq("shopify_product_id", productId).single();
          isPriorityOverride = ov?.is_priority || false;
       }
    }

    await supabase.from("tasks").upsert({
      customer_id: instance.customer_id,
      order_id: instance.order_id,
      task_type: task_type || "follow_up",
      due_date: new Date().toISOString().split("T")[0],
      assigned_to: await assignTaskOwner(supabase),
      priority_score: 50 + (priority_bonus || 0) + (isPriorityOverride ? 50 : 0),
      status: "pending"
    }, { onConflict: "order_id, task_type" });
  }

  private static async logAction(instanceId: string, stepId: string, actionType: string, status: string, payload: any = {}) {
    await supabase.from("workflow_logs").insert({
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
  private static async processSystemAutomation(trigger: WorkflowTrigger, payload: any) {
    const { data: settings } = await supabase.from("settings").select("*").single();
    if (!settings) return;

    let flag = false;
    let template = "";
    
    switch (trigger) {
      case "order_placed":
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
          .not("status", "in", '("done","cancelled")');
        
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
  }

  private static async completeInstance(instance: any, status: string) {
    await supabase.from("workflow_instances").update({
      status: status,
      next_run_at: new Date(Date.now() + 1000 * 3600 * 24 * 365 * 10).toISOString() // Far future
    }).eq("id", instance.id);
  }
}
