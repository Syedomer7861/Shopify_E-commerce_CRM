import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession } from "@/lib/auth-utils";
import { appendFieldVisitRow, getOrgGoogle } from "@/lib/google-org";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENTS = { checked_in: "Checked in", completed: "Completed" } as const;
const ist = (v: string | null) => (v ? new Date(v).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "");

/**
 * Adds one row to the org's Google Sheet ("Field visits" tab plus a tab per
 * executive) when the rep checks in or completes a visit. No-op unless the
 * org switched it on. Only the visit's own rep triggers it, so each event is
 * logged once.
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, "field-sheet", 30, 60_000);
  if (limited) return limited;
  const { errorResponse, user, profile, supabase } = await getAuthenticatedSession();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => ({}));
  const event = EVENTS[body?.event as keyof typeof EVENTS];
  if (!UUID.test(String(body?.visitId || "")) || !event) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const { data: v } = await supabase!.from("visits")
    .select("id, org_id, owner_id, party_name, purpose, status, outcome, planned_at, check_in_at, check_out_at, check_in_lat, check_in_lng, check_in_accuracy_m, check_in_photo_drive_id, contact_id")
    .eq("id", body.visitId).maybeSingle();
  if (!v || v.owner_id !== user!.id) return NextResponse.json({ error: "Visit not found" }, { status: 404 });

  const conn = await getOrgGoogle(v.org_id);
  if (!conn?.field_visits_to_sheet) return NextResponse.json({ ok: false, reason: "off" });
  // The rep can read the contact they visited (field_contacts_read policy).
  const { data: ct } = v.contact_id
    ? await supabase!.from("field_contacts").select("contact_person, designation, phone, whatsapp, email, category, area, city, pincode, interest, marketing_consent").eq("id", v.contact_id).maybeSingle()
    : { data: null };

  const executive = profile?.name || user!.email || "Unknown";
  try {
    await appendFieldVisitRow(conn, {
      "Timestamp": ist(new Date().toISOString()),
      "Event": event,
      "Executive Name": executive,
      "Email Address": user!.email || "",
      "Client / Retailer Name": v.party_name,
      "Type": ct?.category || "",
      "Contact Person": ct?.contact_person || "",
      "Role": ct?.designation || "",
      "Mobile": ct?.phone || "",
      "WhatsApp": ct?.whatsapp || "",
      "Contact Email": ct?.email || "",
      "Area": ct?.area || "",
      "City": ct?.city || "",
      "PIN": ct?.pincode || "",
      "Interest": ct?.interest || "",
      "Agreed to offers": ct ? (ct.marketing_consent === "yes" ? "Yes" : "No") : "",
      "Purpose": v.purpose || "",
      "Visit Outcome": v.outcome || "",
      "Planned": ist(v.planned_at),
      "Checked in": ist(v.check_in_at),
      "Checked out": ist(v.check_out_at),
      "Latitude": v.check_in_lat ?? "",
      "Longitude": v.check_in_lng ?? "",
      "GPS accuracy (m)": v.check_in_accuracy_m ?? "",
      "Google maps": v.check_in_lat != null ? `https://www.google.com/maps?q=${v.check_in_lat},${v.check_in_lng}` : "",
      "Photo": v.check_in_photo_drive_id ? `https://drive.google.com/file/d/${v.check_in_photo_drive_id}/view` : "",
    }, executive);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("field sheet row failed", { org: v.org_id, error: String((e as Error)?.message).slice(0, 200) });
    return NextResponse.json({ ok: false, reason: "google" }, { status: 502 });
  }
}
