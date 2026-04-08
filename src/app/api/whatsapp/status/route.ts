import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  
  // Get Bridge URL from settings
  const { data: settings } = await supabase.from("settings").select("whatsapp_bridge_url").single();
  const bridgeUrl = settings?.whatsapp_bridge_url || "http://127.0.0.1:3001";

  try {
    const res = await fetch(`${bridgeUrl}/status`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      // Set a short timeout
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) throw new Error("Bridge responded with error");
    
    const data = await res.json();
    return NextResponse.json({ ok: true, ...data });
  } catch (err: any) {
    return NextResponse.json({ 
      ok: false, 
      ready: false, 
      state: "DISCONNECTED",
      error: "Could not reach WhatsApp bridge. Ensure wa_server.js is running on port 3001." 
    }, { status: 200 }); // Return 200 so the client can handle the "Disconnected" state gracefully
  }
}
