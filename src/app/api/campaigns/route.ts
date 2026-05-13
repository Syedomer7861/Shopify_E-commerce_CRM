import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * GET /api/campaigns
 * POST /api/campaigns
 * PATCH /api/campaigns/run
 */
export async function GET(req: NextRequest) {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("campaigns")
    .select("*, template:campaign_templates(*)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data });
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  const body = await req.json();
  const { data, error } = await supabase
    .from("campaigns")
    .insert(body)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, campaign: data });
}

/**
 * Triggered to run a campaign.
 * This is where you would normally push to a Redis queue.
 * For now, we'll implement a basic loop or a simple background trigger.
 */
export async function PATCH(req: NextRequest) {
  const supabase = createServerClient();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  // Update status to running
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .update({ status: "running" })
    .eq("id", id)
    .select("*, template:campaign_templates(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // In a real production app, we would use BullMQ/Redis here.
  // Since we are in the "Scaling Foundations" phase, I will create a simple 
  // background task trigger via an Edge function or a long-running route.
  
  // Return immediately, "running" state handled by a background worker logic
  return NextResponse.json({ success: true, message: "Campaign started", status: "running" });
}
