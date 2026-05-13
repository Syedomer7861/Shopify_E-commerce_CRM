import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/heartbeat
 * Updates the agent's last_seen_at timestamp.
 * Called every 60 seconds from the dashboard client.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const agentId = body.agentId;

    if (!agentId) {
      return NextResponse.json({ error: "Missing agentId" }, { status: 400 });
    }

    const supabase = createServerClient();

    const { error } = await supabase
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", agentId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
