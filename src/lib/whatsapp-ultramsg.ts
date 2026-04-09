import { WhatsAppResponse } from "./whatsapp";

export async function sendUltraMsg(
  instanceId: string, 
  token: string, 
  phone: string, 
  message: string, 
  imagePath?: string
): Promise<WhatsAppResponse> {
  const url = `https://api.ultramsg.com/${instanceId}/messages/${imagePath ? "image" : "chat"}`;

  const params = new URLSearchParams();
  params.append("token", token);
  params.append("to", phone);
  
  if (imagePath) {
    params.append("image", imagePath);
    params.append("caption", message);
  } else {
    params.append("body", message);
  }
  
  params.append("priority", "10");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await res.json();
    
    // UltraMsg returns {sent: "true"} or {error: "..."}
    if (data.sent === "true") {
      return { ok: true };
    } else {
      return { ok: false, error: data.error || "UltraMsg reported an error" };
    }
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to reach UltraMsg API" };
  }
}

export async function checkUltraMsgStatus(instanceId: string, token: string) {
  const url = `https://api.ultramsg.com/${instanceId}/instance/status?token=${token}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    // data structure: {status: "authenticated"} or similar
    return {
      ready: data.status === "authenticated",
      state: data.status?.toUpperCase() || "UNKNOWN",
      error: data.error
    };
  } catch (err: any) {
    return { ready: false, state: "UNREACHABLE", error: err.message };
  }
}
