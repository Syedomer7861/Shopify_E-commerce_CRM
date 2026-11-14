import { NextRequest, NextResponse } from "next/server";
import { apiAuth, apiError, listParams, pickStrings, readJson } from "@/lib/api-auth";

const COLS = "id, name, email, phone, company, source, status, est_value, notes, owner_id, custom_fields, created_at";

/** GET /api/v1/leads?limit=50&since=2026-01-01 — newest first. */
export async function GET(req: NextRequest) {
  const caller = await apiAuth(req, "leads:read");
  if (caller instanceof NextResponse) return caller;
  const { limit, sinceIso } = listParams(req);
  let q = caller.admin.from("leads").select(COLS).eq("org_id", caller.orgId).order("created_at", { ascending: false }).limit(limit);
  if (sinceIso) q = q.gte("created_at", sinceIso);
  const { data, error } = await q;
  if (error) return apiError(500, "Could not read leads");
  return NextResponse.json({ data });
}

/** POST /api/v1/leads — { name, email?, phone?, company?, source?, notes?, est_value?, custom_fields? } */
export async function POST(req: NextRequest) {
  const caller = await apiAuth(req, "leads:write");
  if (caller instanceof NextResponse) return caller;
  const body = await readJson(req);
  if (!body) return apiError(400, "Send a JSON object");
  const s = pickStrings(body, { name: 120, email: 200, phone: 40, company: 160, source: 60, notes: 4000 });
  if (!s.name) return apiError(400, "name is required");
  const est = body.est_value;
  if (est !== undefined && (typeof est !== "number" || !Number.isFinite(est) || est < 0)) return apiError(400, "est_value must be a positive number");
  const custom = body.custom_fields;
  if (custom !== undefined && (typeof custom !== "object" || custom === null || Array.isArray(custom))) return apiError(400, "custom_fields must be an object");

  const id = crypto.randomUUID();
  const { error } = await caller.admin.from("leads").insert({
    id, org_id: caller.orgId, owner_id: null, status: "new", source: s.source || "API", ...s,
    est_value: typeof est === "number" ? est : null, custom_fields: custom || {},
  });
  // 23514 = a custom field the workspace never defined, or a wrong type.
  if (error) return apiError(error.code === "23514" ? 400 : 500, error.code === "23514" ? error.message : "Could not create the lead");
  return NextResponse.json({ data: { id } }, { status: 201 });
}
