import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";
import { getSystemSettings } from "@/lib/server-settings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createServerClient();

  // settings RLS is admin-only now; requireInternal allows any authenticated
  // caller here, so this needs the service-role fallback.
  const settings = await getSystemSettings(supabase);
  const bridgeUrl = settings?.whatsapp_bridge_url || "http://127.0.0.1:3001";

  try {
    const res = await fetch(`${bridgeUrl}/qr-data`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) throw new Error("Bridge responded with error");

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      {
        qr: null,
        state: "DISCONNECTED",
        ready: false,
        error: "Could not reach WhatsApp bridge. Ensure wa_server.js is running.",
      },
      { status: 200 }
    );
  }
}
