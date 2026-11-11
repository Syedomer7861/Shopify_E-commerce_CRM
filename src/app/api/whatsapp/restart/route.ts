import { NextRequest, NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";
import { getSystemSettings } from "@/lib/server-settings";

export async function POST(req: NextRequest) {
  const unauthorized = await requirePrivileged(req);
  if (unauthorized) return unauthorized;

  const supabase = createServerClient();
  // settings RLS is admin-only now; requirePrivileged allows any authenticated
  // caller here, so this needs the service-role fallback.
  const settings = await getSystemSettings(supabase);
  const bridgeUrl = settings?.whatsapp_bridge_url || "http://127.0.0.1:3001";

  try {
    const res = await fetch(`${bridgeUrl}/restart`, { method: "POST" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "Bridge unreachable" }, { status: 500 });
  }
}
