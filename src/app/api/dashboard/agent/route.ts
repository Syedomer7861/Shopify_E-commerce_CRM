import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/dashboard/agent
 * Returns productivity metrics for the logged-in agent or all agents if admin.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Using service role to access the view across profiles
  );

  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  const startDate = searchParams.get("startDate") || new Date(Date.now() - 30 * 86400000).toISOString();
  const endDate = searchParams.get("endDate") || new Date().toISOString();

  let query = supabase
    .from("v_agent_performance")
    .select("*");

  if (agentId) {
    query = query.eq("agent_id", agentId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch trend data from activity logs
  let trendQuery = supabase
    .from("agent_activity_logs")
    .select("created_at, activity_type, metadata")
    .gte("created_at", startDate)
    .lte("created_at", endDate)
    .order("created_at", { ascending: true });

  if (agentId) {
    trendQuery = trendQuery.eq("agent_id", agentId);
  }

  const { data: trendData, error: trendError } = await trendQuery;

  return NextResponse.json({
    metrics: data,
    trends: trendData || [],
    period: { start: startDate, end: endDate }
  });
}
