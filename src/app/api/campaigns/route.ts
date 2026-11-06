import { NextRequest, NextResponse } from "next/server";
import { ensureAdmin } from "@/lib/auth-utils";
import { populateRecipients, processCampaignSends } from "@/lib/campaign-engine";

/**
 * GET /api/campaigns            - list campaigns
 * GET /api/campaigns?logs=<id>  - one campaign's recipient log
 * POST /api/campaigns
 * PUT /api/campaigns?id=<id>
 * DELETE /api/campaigns?id=<id>
 * PATCH /api/campaigns?id=<id>&action=run|pause
 */
export async function GET(req: NextRequest) {
  const { errorResponse, supabase } = await ensureAdmin();
  if (errorResponse) return errorResponse;

  const logsFor = req.nextUrl.searchParams.get("logs");
  if (logsFor) {
    const { data, error } = await supabase!
      .from("campaign_recipients")
      .select("*")
      .eq("campaign_id", logsFor)
      .order("created_at", { ascending: true })
      .limit(2000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ recipients: data || [] });
  }

  const { data, error } = await supabase!
    .from("campaigns")
    .select("*, template:campaign_templates(*)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ campaigns: data || [] });
}

export async function POST(req: NextRequest) {
  const { errorResponse, supabase } = await ensureAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json();
  const { name, template_id, target_segment, min_delay, max_delay, scheduled_start, send_window_start, send_window_end } = body;

  const { data, error } = await supabase!
    .from("campaigns")
    .insert({
      name,
      template_id,
      target_segment,
      min_delay: min_delay ?? 30,
      max_delay: max_delay ?? 90,
      send_window_start: send_window_start || "09:00",
      send_window_end: send_window_end || "21:00",
      scheduled_at: scheduled_start || null,
      status: scheduled_start ? "scheduled" : "draft"
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, campaign: data });
}

export async function PUT(req: NextRequest) {
  const { errorResponse, supabase } = await ensureAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const body = await req.json();
  const { name, template_id, target_segment, min_delay, max_delay, scheduled_start, send_window_start, send_window_end } = body;

  const { data, error } = await supabase!
    .from("campaigns")
    .update({
      name,
      template_id,
      target_segment,
      min_delay,
      max_delay,
      send_window_start,
      send_window_end,
      scheduled_at: scheduled_start || null,
      status: scheduled_start ? "scheduled" : "draft"
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, campaign: data });
}

export async function DELETE(req: NextRequest) {
  const { errorResponse, supabase } = await ensureAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const { error } = await supabase!.from("campaigns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, message: "Campaign deleted" });
}

export async function PATCH(req: NextRequest) {
  const { errorResponse, supabase } = await ensureAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const action = searchParams.get("action") || "run";
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  if (action === "pause") {
    const { data, error } = await supabase!
      .from("campaigns")
      .update({ status: "paused" })
      .eq("id", id)
      .select("*, template:campaign_templates(*)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, message: "Campaign paused", campaign: data });
  }

  const { data: campaign, error } = await supabase!
    .from("campaigns")
    .select("*, template:campaign_templates(*)")
    .eq("id", id)
    .single();
  if (error || !campaign) return NextResponse.json({ error: error?.message || "Campaign not found" }, { status: 404 });
  if (campaign.status === "completed") return NextResponse.json({ error: "Campaign already completed" }, { status: 400 });
  if (!campaign.template?.body) return NextResponse.json({ error: "Campaign has no template" }, { status: 400 });

  const count = await populateRecipients(supabase, id, campaign.target_segment, campaign.org_id);

  const { data: updated, error: updateError } = await supabase!
    .from("campaigns")
    .update({ status: "running", total_recipients: count, delivered_count: 0, failed_count: 0 })
    .eq("id", id)
    .select("*, template:campaign_templates(*)")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Best-effort immediate progress so clicking "Start" isn't a silent no-op
  // for up to 15 minutes until the next cron tick. The rest is picked up by
  // /api/cron/campaign-sender.
  await processCampaignSends(supabase, Date.now() + 8_000);

  return NextResponse.json({ success: true, message: "Campaign started", campaign: updated });
}
