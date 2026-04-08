import { createClient } from "./supabase";

export interface WhatsAppResponse {
  ok: boolean;
  error?: string;
}

export async function sendWhatsApp(phone: string, message: string, imagePath?: string): Promise<WhatsAppResponse> {
  const supabase = createClient();
  
  // 1. Get Bridge URL from settings
  const { data: settings } = await supabase.from("settings").select("whatsapp_bridge_url").single();
  const bridgeUrl = settings?.whatsapp_bridge_url || "http://localhost:3001";

  try {
    const res = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message, imagePath }),
    });

    const data = await res.json();
    return { ok: data.ok, error: data.error };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to reach WhatsApp bridge" };
  }
}

export function cleanPhone(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) {
    return "+" + cleaned;
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
