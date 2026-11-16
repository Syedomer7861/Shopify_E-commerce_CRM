import { NextRequest, NextResponse } from "next/server";
import { privilegedScope } from "@/lib/auth-utils";
import { createAdminClient } from "@/lib/supabase";
import { bridgeUrlFor, getBridgeOwnerOrgId } from "@/lib/server-settings";

const NO_BRIDGE = "No WhatsApp bridge is set up for this workspace.";

/**
 * Settings-page calls to the signed-in admin's own WhatsApp bridge (own URL,
 * owner env bridge, or their session on the hosted bridge). The bridge URL
 * never reaches the browser - for the hosted bridge it is a credential.
 */
export async function proxyBridge(req: NextRequest, path: "/status" | "/qr-data" | "/restart" | "/logout", method: "GET" | "POST" = "GET") {
  const scope = await privilegedScope(req);
  if (scope.error) return scope.error;
  const orgId = scope.orgId ?? (await getBridgeOwnerOrgId());
  const down = (error: string) => NextResponse.json({ ok: false, ready: false, state: "DISCONNECTED", qr: null, error });
  if (!orgId) return down(NO_BRIDGE);

  const { data } = await createAdminClient().from("settings").select("whatsapp_bridge_url").eq("org_id", orgId).maybeSingle();
  const url = await bridgeUrlFor({ org_id: orgId, whatsapp_bridge_url: data?.whatsapp_bridge_url });
  if (!url) return down(process.env.WHATSAPP_HOSTED_BRIDGE_URL ? NO_BRIDGE : "Connect by QR is not switched on yet. Use the Meta API above, or ask CodeCrest to enable it.");

  try {
    const res = await fetch(`${url}${path}`, { method, headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok && res.status !== 503) throw new Error(`bridge ${res.status}`);
    return NextResponse.json({ ok: true, ...(await res.json()) });
  } catch {
    // Say which bridge failed: an org's own server is theirs to start; the hosted one is ours.
    const own = data?.whatsapp_bridge_url && url === data.whatsapp_bridge_url;
    return down(own
      ? "Your own bridge server (Bridge Server URL below) is not reachable. Start it, or clear that field to use the CodeCrest hosted connection."
      : "Could not reach the WhatsApp bridge. Try again in a minute; if it keeps failing, contact support.");
  }
}
