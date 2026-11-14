import { NextRequest, NextResponse } from "next/server";
import { apiAuth, apiError, listParams } from "@/lib/api-auth";

const COLS = "id, subject, description, category, priority, status, requester_id, assignee_id, sla_due_at, sla_breached_at, resolved_at, created_at";

/** GET /api/v1/tickets?limit=50&since=2026-01-01 */
export async function GET(req: NextRequest) {
  const caller = await apiAuth(req, "tickets:read");
  if (caller instanceof NextResponse) return caller;
  const { limit, sinceIso } = listParams(req);
  let q = caller.admin.from("tickets").select(COLS).eq("org_id", caller.orgId).order("created_at", { ascending: false }).limit(limit);
  if (sinceIso) q = q.gte("created_at", sinceIso);
  const { data, error } = await q;
  if (error) return apiError(500, "Could not read tickets");
  return NextResponse.json({ data });
}
