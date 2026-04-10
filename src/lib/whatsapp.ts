/**
 * WhatsApp messaging via local bridge (wa_server.js)
 * 100% free — uses whatsapp-web.js under the hood
 */
import { createClient } from "./supabase";

export interface WhatsAppResponse {
  ok: boolean;
  error?: string;
}

export async function sendWhatsApp(phone: string, message: string, imagePath?: string): Promise<WhatsAppResponse> {
  const supabase = createClient();
  
  // Get bridge URL from settings
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
    const isLocalhost = bridgeUrl.includes("localhost") || bridgeUrl.includes("127.0.0.1");
    const isProduction = process.env.NEXT_PUBLIC_VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
    
    let errorMessage = err.message || "Failed to reach WhatsApp bridge";
    if (isLocalhost && isProduction) {
      errorMessage = "Bridge unreachable: Cannot reach 'localhost' from the cloud. Use ngrok or host the bridge on a VPS.";
    } else if (err.name === 'AbortError' || err.message?.includes('fetch')) {
      errorMessage = "Bridge unreachable: Ensure wa_server.js is running on your PC.";
    }

    return { ok: false, error: errorMessage };
  }
}

export function cleanPhone(phone: string): string {
  const cleaned = phone.replace(/[^\\d+]/g, "");
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
