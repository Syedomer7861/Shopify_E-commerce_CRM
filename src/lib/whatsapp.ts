/**
 * WhatsApp messaging via Meta Cloud API (Primary) and Local Bridge (Fallback)
 */
import { createClient } from "./supabase";

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
  metadata = {}
}: {
  phone: string;
  body: string;
  type: string;
  direction: "inbound" | "outbound";
  metaId?: string;
  metadata?: any;
}) {
  const supabase = createClient();
  
  // Clean phone for lookup
  const cleanedPhone = phone.replace(/[^0-9]/g, "").replace(/^91/, "");
  const { data: customer } = await supabase.from("customers")
    .select("id")
    .or(`phone.ilike.%${cleanedPhone}%,alt_phone.ilike.%${cleanedPhone}%`)
    .single();

  await supabase.from("whatsapp_messages").insert({
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

export async function sendWhatsApp(phone: string, message: string, imagePath?: string): Promise<WhatsAppResponse> {
  const supabase = createClient();
  
  const { data: settings } = await supabase.from("settings")
     .select("whatsapp_bridge_url, whatsapp_token, whatsapp_phone_id")
     .single();
     
  // 1. Official Meta Cloud API (Primary Route)
  if (settings?.whatsapp_token && settings?.whatsapp_phone_id) {
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
      if (!res.ok || data.error) {
         return { ok: false, error: data.error?.message || "Meta API Rejected Message" };
      }

      await saveMessageToHistory({
        phone,
        body: message,
        type: "text",
        direction: "outbound",
        metaId: data.messages?.[0]?.id,
        metadata: { gateway: "meta" }
      });

      return { ok: true, messageId: data.messages?.[0]?.id };
    } catch (err: any) {
      return { ok: false, error: err.message || "Failed to reach Meta API" };
    }
  }

  // 2. Legacy wa_server.js Local Bridge (Fallback Route)
  const bridgeUrl = settings?.whatsapp_bridge_url || "http://localhost:3001";
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
         metadata: { gateway: "local_bridge" }
       });
    }
    return { ok: data.ok, error: data.error };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to reach WhatsApp bridge" };
  }
}

export async function sendMetaTemplate(
  phone: string, 
  templateName: string, 
  data: Record<string, any>
): Promise<WhatsAppResponse> {
  const supabase = createClient();
  
  // 1. Resolve Template Mapping from DB
  const { data: template } = await supabase
    .from("campaign_templates")
    .select("meta_template_name, meta_variable_mapping, body")
    .eq("name", templateName)
    .single();

  const { data: settings } = await supabase.from("settings")
     .select("whatsapp_token, whatsapp_phone_id, meta_review_name, meta_reorder_name, meta_recovery_name, meta_final_name")
     .single();

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
  // If mapping exists, we use it to cherry-pick values from 'data' in order
  const parameters = mapping.length > 0 
    ? mapping.map(key => ({ type: "text", text: data[key]?.toString() || "" }))
    : Object.values(data).map(val => ({ type: "text", text: val?.toString() || "" }));
     
  if (!settings?.whatsapp_token || !settings?.whatsapp_phone_id) {
     return { ok: false, error: "Meta API credentials missing" };
  }
  
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
     if (!res.ok || resData.error) return { ok: false, error: resData.error?.message || "Template execution failed" };

     // Log to history
     await saveMessageToHistory({
        phone,
        body: `[Template] ${metaName}`,
        type: "template",
        direction: "outbound",
        metaId: resData.messages?.[0]?.id,
        metadata: { template_name: metaName, params: parameters }
     });

     return { ok: true, messageId: resData.messages?.[0]?.id };
  } catch (err: any) {
     return { ok: false, error: err.message || "Failed to reach Meta API" };
  }
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
