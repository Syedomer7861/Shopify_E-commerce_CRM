import { NextRequest, NextResponse } from "next/server";
import { apiAuth, apiError, listParams, pickStrings, readJson } from "@/lib/api-auth";

const COLS = "id, title, value, status, expected_close, lead_id, notes, owner_id, custom_fields, created_at";
const STATUSES = ["open", "proposal", "negotiation", "won", "lost"];

/** GET /api/v1/deals?limit=50&since=2026-01-01&status=won */
export async function GET(req: NextRequest) {
  const caller = await apiAuth(req, "deals:read");
  if (caller instanceof NextResponse) return caller;
  const { limit, sinceIso } = listParams(req);
  const status = req.nextUrl.searchParams.get("status");
  let q = caller.admin.from("deals").select(COLS).eq("org_id", caller.orgId).order("created_at", { ascending: false }).limit(limit);
  if (sinceIso) q = q.gte("created_at", sinceIso);
  if (status && STATUSES.includes(status)) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return apiError(500, "Could not read deals");
  return NextResponse.json({ data });
}

/** POST /api/v1/deals — { title, value, status?, expected_close?, notes?, lead_id? } */
export async function POST(req: NextRequest) {
  const caller = await apiAuth(req, "deals:write");
  if (caller instanceof NextResponse) return caller;
  const body = await readJson(req);
  if (!body) return apiError(400, "Send a JSON object");
  const s = pickStrings(body, { title: 200, notes: 4000, status: 20, expected_close: 10, lead_id: 36 });
  if (!s.title) return apiError(400, "title is required");
  if (typeof body.value !== "number" || !Number.isFinite(body.value) || body.value < 0) return apiError(400, "value must be a positive number");
  if (s.status && !STATUSES.includes(s.status)) return apiError(400, `status must be one of ${STATUSES.join(", ")}`);
  if (s.expected_close && !/^\d{4}-\d{2}-\d{2}$/.test(s.expected_close)) return apiError(400, "expected_close must be YYYY-MM-DD");
  if (s.lead_id) {
    const { data: lead } = await caller.admin.from("leads").select("id").eq("id", s.lead_id).eq("org_id", caller.orgId).maybeSingle();
    if (!lead) return apiError(400, "lead_id not found in this workspace");
  }
  const id = crypto.randomUUID();
  const { error } = await caller.admin.from("deals").insert({ id, org_id: caller.orgId, owner_id: null, status: s.status || "open", ...s, value: body.value });
  if (error) return apiError(500, "Could not create the deal");
  return NextResponse.json({ data: { id } }, { status: 201 });
}
