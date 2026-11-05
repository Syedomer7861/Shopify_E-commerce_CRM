import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
export const dynamic = "force-dynamic";
import { createAdminClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();

  // One shared WhatsApp bridge process today (see the webhook route for
  // why), so there's one bridge URL - the seed org's. .maybeSingle() with
  // no org filter would error outright once a 2nd org's settings row
  // exists (more than one row).
  const { getDefaultOrgId } = await import("@/lib/server-settings");
  const orgId = await getDefaultOrgId();
  // Get Bridge URL: env var takes priority (always correct for local dev),
  // then settings DB (for production where Tailscale URL may be set)
  const { data: settings } = await supabase.from("settings").select("whatsapp_bridge_url").eq("org_id", orgId).maybeSingle();
  const bridgeUrl = process.env.WHATSAPP_BRIDGE_URL || settings?.whatsapp_bridge_url || "http://127.0.0.1:3001";

  try {
    const res = await fetch(`${bridgeUrl}/status`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      // Set a short timeout
      signal: AbortSignal.timeout(3000),
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
