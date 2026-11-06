/**
 * WhatsApp messaging via Meta Cloud API (Primary) and Local Bridge (Fallback)
 */
import { createServerClient } from "./supabase";
import { getSystemSettings } from "./server-settings";

export interface WhatsAppResponse {
  ok: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Helper to persist conversation history
 */
async function saveMessageToHistory({
  phone,
  body,
  type,
  direction,
  metaId,
  metadata = {},
  orgId
}: {
  phone: string;
  body: string;
  type: string;
  direction: "inbound" | "outbound";
  metaId?: string;
  metadata?: any;
  orgId?: string;
}) {
  const supabase = createServerClient();

  // Clean phone for lookup - org-scoped so this can't attribute the
  // message history to a different tenant's customer sharing the same
  // phone number.
  const cleanedPhone = phone.replace(/[^0-9]/g, "").replace(/^91/, "");
  let customerQuery = supabase.from("customers")
    .select("id")
    .or(`phone.ilike.%${cleanedPhone}%,alt_phone.ilike.%${cleanedPhone}%`);
  if (orgId) customerQuery = customerQuery.eq("org_id", orgId);
  const { data: customer } = await customerQuery.single();

  await supabase.from("whatsapp_messages").insert({
    org_id: orgId,
    customer_id: customer?.id || null,
    phone,
    body,
    type,
    direction,
    meta_message_id: metaId,
    metadata,
    status: direction === "inbound" ? "received" : "sent"
  });
}

class MessageQueue {
  private queue: (() => Promise<any>)[] = [];
  private processing = false;

  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
      this.processNext();
    });
  }

  private async processNext() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    const nextTask = this.queue.shift();
    if (nextTask) {
      try {
        await nextTask();
      } catch (err) {
        console.error("Queue execution error:", err);
      }
    }

    this.processing = false;
    this.processNext();
  }
}

const sendQueue = new MessageQueue();
let lastSentTime = 0;

async function enforceSafeguardDelay(supabase: any) {
  try {
    // settings RLS is admin-only now (it holds API secrets) - this is
    // trusted first-party server code acting on the caller's behalf, not a
    // client query, so it needs getSystemSettings' built-in fallback to the
    // service-role client rather than a raw .select() under the caller's
    // own (often non-admin) session.
    const settings = await getSystemSettings(supabase);

    const minDelay = settings?.wa_min_delay ?? 30;
    const maxDelay = settings?.wa_max_delay ?? 90;
    
    const now = Date.now();
    const elapsedSeconds = (now - lastSentTime) / 1000;
    
    // Choose a random safe delay in seconds
    const targetDelaySeconds = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);
    
    if (lastSentTime > 0 && elapsedSeconds < targetDelaySeconds) {
      const waitMs = Math.floor((targetDelaySeconds - elapsedSeconds) * 1000);
      console.log(`[Anti-Ban Safeguard] Spacing active. Waiting ${waitMs / 1000}s before next send...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  } catch (err) {
    console.error("[Anti-Ban Safeguard] Failed to fetch settings delay, skipping sleep:", err);
  } finally {
    lastSentTime = Date.now();
  }
}

async function sendTwilioSMS(
  sid: string,
  token: string,
  from: string,
  to: string,
  body: string
): Promise<{ ok: boolean; error?: string; sid?: string }> {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const authString = Buffer.from(`${sid}:${token}`).toString("base64");
    
    // Ensure 'to' is formatted correctly with a '+' if needed
    let formattedTo = to.replace(/[^0-9+]/g, "");
    if (!formattedTo.startsWith("+")) {
      formattedTo = "+" + (formattedTo.startsWith("91") ? formattedTo : "91" + formattedTo);
    }
    
    const params = new URLSearchParams();
    params.append("To", formattedTo);
    params.append("From", from);
    params.append("Body", body);
    
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authString}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    });
    
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.message || "Twilio API error" };
    }
    return { ok: true, sid: data.sid };
  } catch (err: any) {
    return { ok: false, error: err.message || "Twilio network error" };
  }
}

export async function sendWhatsApp(phone: string, message: string, imagePath?: string, orgId?: string): Promise<WhatsAppResponse> {
  return sendQueue.enqueue(async () => {
    const supabase = createServerClient();
    await enforceSafeguardDelay(supabase);

    const settings = await getSystemSettings(supabase, orgId);


    let whatsappResult: WhatsAppResponse = { ok: false, error: "No WhatsApp messaging gateway configured" };

    // 1. Legacy wa_server.js Local Bridge (Primary Route if configured)
    const bridgeUrl = process.env.WHATSAPP_BRIDGE_URL || settings?.whatsapp_bridge_url;
    if (bridgeUrl) {
      try {
        const res = await fetch(`${bridgeUrl}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, message, imagePath }),
        });

        const data = await res.json();
        if (data.ok) {
           await saveMessageToHistory({
             phone,
             body: message,
             type: "text",
             direction: "outbound",
             metadata: { gateway: "local_bridge" },
             orgId: settings?.org_id
           });
           return { ok: true };
        }
        whatsappResult = { ok: false, error: data.error || "Bridge rejected message" };
      } catch (err: any) {
        console.error("Bridge failed, checking for Meta fallback:", err.message);
        whatsappResult = { ok: false, error: err.message || "Failed to reach WhatsApp bridge" };
      }
    }

    // 2. Official Meta Cloud API (Secondary Route)
    if (!whatsappResult.ok && settings?.whatsapp_token && settings?.whatsapp_phone_id) {
      try {
        const payload = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phone.replace(/[^0-9]/g, ""),
          type: "text",
          text: { preview_url: true, body: message }
        };

        const res = await fetch(`https://graph.facebook.com/v20.0/${settings.whatsapp_phone_id}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${settings.whatsapp_token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (res.ok && !data.error) {
          await saveMessageToHistory({
            phone,
            body: message,
            type: "text",
            direction: "outbound",
            metaId: data.messages?.[0]?.id,
            metadata: { gateway: "meta" },
            orgId: settings?.org_id
          });
          return { ok: true, messageId: data.messages?.[0]?.id };
        }
        whatsappResult = { ok: false, error: data.error?.message || "Meta API Rejected Message" };
      } catch (err: any) {
        whatsappResult = { ok: false, error: err.message || "Failed to reach Meta API" };
      }
    }

    // 3. SMS Fallback if enabled and WhatsApp failed
    if (!whatsappResult.ok && settings?.sms_fallback_enabled) {
      console.log(`[SMS Fallback] WhatsApp failed: ${whatsappResult.error}. Initiating SMS fallback...`);
      if (
        settings.sms_provider === "twilio" &&
        settings.sms_twilio_sid &&
        settings.sms_twilio_token &&
        settings.sms_twilio_number
      ) {
        const smsRes = await sendTwilioSMS(
          settings.sms_twilio_sid,
          settings.sms_twilio_token,
          settings.sms_twilio_number,
          phone,
          message
        );
        
        if (smsRes.ok) {
          await saveMessageToHistory({
            phone,
            body: message,
            type: "sms",
            direction: "outbound",
            metaId: smsRes.sid,
            metadata: { gateway: "sms_fallback", sms_provider: "twilio", whatsapp_error: whatsappResult.error },
            orgId: settings?.org_id
          });
          return { ok: true, messageId: smsRes.sid };
        } else {
          console.error(`[SMS Fallback] Failed to send Twilio SMS: ${smsRes.error}`);
          return { ok: false, error: `WhatsApp failed (${whatsappResult.error}) & SMS Fallback failed (${smsRes.error})` };
        }
      } else {
        return { ok: false, error: `WhatsApp failed (${whatsappResult.error}) & SMS Fallback configured but credentials missing` };
      }
    }

    return whatsappResult;
  });
}

export async function sendMetaTemplate(
  phone: string,
  templateName: string,
  data: Record<string, any>,
  orgId?: string
): Promise<WhatsAppResponse> {
  return sendQueue.enqueue(async () => {
    const supabase = createServerClient();
    await enforceSafeguardDelay(supabase);

    const settings = await getSystemSettings(supabase, orgId);

    // 1. Resolve Template Mapping from DB
    let templateQuery = supabase
      .from("campaign_templates")
      .select("meta_template_name, meta_variable_mapping, body")
      .eq("name", templateName);
    if (settings?.org_id) templateQuery = templateQuery.eq("org_id", settings.org_id);
    const { data: template } = await templateQuery.single();

    let metaName = template?.meta_template_name;

    // Fallback to global settings if not explicitly mapped in the template record
    if (!metaName) {
      if (templateName === "Review Reminder") metaName = settings?.meta_review_name;
      else if (templateName === "Reorder Reminder") metaName = settings?.meta_reorder_name;
      else if (templateName === "Abandoned Checkout Strategy" || templateName === "Abandoned Cart") metaName = settings?.meta_recovery_name;
      else if (templateName === "Final Follow-up") metaName = settings?.meta_final_name;
      
      // Default to a slugified version if still nothing
      if (!metaName) metaName = templateName.toLowerCase().replace(/\s+/g, "_");
    }

    const mapping = (template?.meta_variable_mapping as string[]) || [];

    // 2. Build Parameters List Based on Mapping
    const parameters = mapping.length > 0 
      ? mapping.map(key => ({ type: "text", text: data[key]?.toString() || "" }))
      : Object.values(data).map(val => ({ type: "text", text: val?.toString() || "" }));
       
    let whatsappResult: WhatsAppResponse = { ok: false, error: "Meta API credentials missing" };

    if (settings?.whatsapp_token && settings?.whatsapp_phone_id) {
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone.replace(/[^0-9]/g, ""),
        type: "template",
        template: {
          name: metaName,
          language: { code: "en" },
          components: parameters.length > 0 ? [{
            type: "body",
            parameters: parameters
          }] : []
        }
      };

      try {
         const res = await fetch(`https://graph.facebook.com/v20.0/${settings.whatsapp_phone_id}/messages`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${settings.whatsapp_token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
         });
         
         const resData = await res.json();
         if (res.ok && !resData.error) {
           await saveMessageToHistory({
              phone,
              body: `[Template] ${metaName}`,
              type: "template",
              direction: "outbound",
              metaId: resData.messages?.[0]?.id,
              metadata: { template_name: metaName, params: parameters },
              orgId: settings?.org_id
           });
           return { ok: true, messageId: resData.messages?.[0]?.id };
         }
         whatsappResult = { ok: false, error: resData.error?.message || "Template execution failed" };
      } catch (err: any) {
         whatsappResult = { ok: false, error: err.message || "Failed to reach Meta API" };
      }
    }

    // 3. SMS Fallback
    if (!whatsappResult.ok && settings?.sms_fallback_enabled) {
      console.log(`[SMS Fallback] Template sending failed: ${whatsappResult.error}. Initiating SMS fallback...`);
      const personalisedBody = template?.body ? personaliseTemplate(template.body, data) : `[Template] ${metaName}`;
      
      if (
        settings.sms_provider === "twilio" &&
        settings.sms_twilio_sid &&
        settings.sms_twilio_token &&
        settings.sms_twilio_number
      ) {
        const smsRes = await sendTwilioSMS(
          settings.sms_twilio_sid,
          settings.sms_twilio_token,
          settings.sms_twilio_number,
          phone,
          personalisedBody
        );

        if (smsRes.ok) {
          await saveMessageToHistory({
            phone,
            body: personalisedBody,
            type: "sms",
            direction: "outbound",
            metaId: smsRes.sid,
            metadata: { gateway: "sms_fallback", sms_provider: "twilio", template_name: metaName, whatsapp_error: whatsappResult.error },
            orgId: settings?.org_id
          });
          return { ok: true, messageId: smsRes.sid };
        } else {
          console.error(`[SMS Fallback] Failed to send Twilio SMS for template: ${smsRes.error}`);
          return { ok: false, error: `WhatsApp Template failed (${whatsappResult.error}) & SMS Fallback failed (${smsRes.error})` };
        }
      } else {
        return { ok: false, error: `WhatsApp Template failed (${whatsappResult.error}) & SMS Fallback configured but credentials missing` };
      }
    }

    return whatsappResult;
  });
}

export function cleanPhone(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) {
    return "+" + (cleaned.startsWith("91") ? cleaned : "91" + cleaned);
  }
  return cleaned;
}

export function personaliseTemplate(template: string, data: Record<string, any>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    const placeholder = new RegExp(`{{${key}}}`, "g");
    result = result.replace(placeholder, value?.toString() || "");
  }
  return result;
}

/**
 * Resolves standard system variables from customer, order, and cart data.
 */
export function getTemplateVariables(customer: any, order?: any, cart?: any, task?: any): Record<string, string> {
  const vars: Record<string, string> = {
    name: customer?.name || "Customer",
    first_name: customer?.name?.split(" ")[0] || "there",
    phone: customer?.phone || "",
    email: customer?.email || "",
    city: customer?.city || order?.customer?.city || "",
    state: customer?.state || order?.customer?.state || "",
    
    order_no: order?.order_number || order?.shopify_order_id || "your order",
    total_amount: order?.total_price?.toString() || cart?.total_price?.toString() || "0",
    tracking_no: order?.tracking_number || "Not Available",
    tracking_link: order?.tracking_number 
      ? `https://cureforever.shiprocket.co/tracking/${order.tracking_number}`
      : "https://cureforever.in/account",
    
    fulfillment_status: order?.fulfillment_status || "Processing",
    delivery_status: order?.delivery_status || "Pending",
    ordered_at: order?.ordered_at ? new Date(order.ordered_at).toLocaleDateString() : "Recently",
    
    product: order?.line_items?.[0]?.name || order?.line_items?.[0]?.title || cart?.line_items?.[0]?.name || "your items",
    items_list: (order?.line_items || cart?.line_items || [])
      .map((i: any) => i.name || i.title || "Item")
      .join(", ") || "your items",
    
    abandon_link: cart?.custom_meta?.ABANDONLINK || customer?.custom_meta?.ABANDONLINK || "https://cureforever.in/cart",
    due_date: task?.due_date ? new Date(task.due_date).toLocaleDateString() : "",
  };
  
  return vars;
}
