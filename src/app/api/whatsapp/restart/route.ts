import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: settings } = await supabase.from("settings").select("whatsapp_bridge_url").single();
  const bridgeUrl = settings?.whatsapp_bridge_url || "http://127.0.0.1:3001";

  try {
    const res = await fetch(`${bridgeUrl}/restart`, { method: "POST" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "Bridge unreachable" }, { status: 500 });
  }
}
