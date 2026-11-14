import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { notifyUser } from "@/lib/notifications-server";

type Ctx = { params: { id: string } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * Public web-to-lead endpoint. Anyone may post, so: per-IP rate limit, a
 * honeypot field bots fill in, size caps, and only string values. Which
 * fields are kept, and whether the form is live at all, is decided by the
 * database function submit_web_form (service key only).
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!UUID.test(params.id)) return NextResponse.json({ error: "Form not found" }, { status: 404, headers: CORS });
  const limited = await rateLimit(req, "web-form", 10, 60_000);
  if (limited) return limited;

  const isJson = (req.headers.get("content-type") || "").includes("application/json");
  let raw: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 20_000) return NextResponse.json({ error: "Too much data" }, { status: 413, headers: CORS });
    raw = isJson ? JSON.parse(text) : Object.fromEntries(new URLSearchParams(text));
  } catch {
    return NextResponse.json({ error: "Invalid submission" }, { status: 400, headers: CORS });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NextResponse.json({ error: "Invalid submission" }, { status: 400, headers: CORS });

  // Honeypot: hidden from people, filled by bots. Pretend success.
  if (typeof raw.website === "string" && raw.website.trim()) return NextResponse.json({ ok: true }, { headers: CORS });

  const data: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(raw).slice(0, 40)) {
    if (k.length > 44) continue;
    if (typeof v === "string") data[k] = v.slice(0, 4000);
    else if (typeof v === "number" && Number.isFinite(v)) data[k] = v;
  }

  const admin = createAdminClient();
  // Numbers typed into number fields arrive as text from a plain HTML form.
  const { data: form } = await admin.rpc("web_form_public", { p_form: params.id });
  if (!form) return NextResponse.json({ error: "This form is not accepting responses" }, { status: 404, headers: CORS });
  for (const c of (form as { custom: { key: string; field_type: string; required: boolean }[] }).custom) {
    const k = `cf:${c.key}`;
    const v = data[k];
    if (c.required && (v === undefined || String(v).trim() === "")) {
      return NextResponse.json({ error: `Please fill in all required fields` }, { status: 400, headers: CORS });
    }
    if (c.field_type === "number" && typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (!Number.isFinite(n)) return NextResponse.json({ error: "Please enter a valid number" }, { status: 400, headers: CORS });
      data[k] = n;
    }
  }

  const { data: result, error } = await admin.rpc("submit_web_form", { p_form: params.id, p_data: data });
  if (error) {
    const known = error.code === "23514" || error.code === "P0002";
    if (!known) console.error("[web-form] submit failed:", error.message);
    return NextResponse.json({ error: known ? error.message : "Could not send. Please try again." }, { status: known ? 400 : 500, headers: CORS });
  }

  const r = result as { lead_id: string; assign_to: string | null; form_name: string; success_message: string };
  if (r.assign_to) await notifyUser(r.assign_to, `New lead from ${r.form_name}`, String(data.name || ""), "/leads", "info");

  if (!isJson) {
    // Plain HTML form on another site: show a simple thank-you page.
    return new NextResponse(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Thank you</title><p style="font-family:system-ui;padding:2rem">${escapeHtml(r.success_message)}</p>`,
      { headers: { ...CORS, "Content-Type": "text/html; charset=utf-8" } });
  }
  return NextResponse.json({ ok: true, message: r.success_message }, { headers: CORS });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
