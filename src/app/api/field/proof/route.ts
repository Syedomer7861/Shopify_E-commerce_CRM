import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession } from "@/lib/auth-utils";
import { createAdminClient } from "@/lib/supabase";
import { getOrgGoogle, readDriveFile, uploadFieldPhoto } from "@/lib/google-org";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 3 * 1024 * 1024;
const safe = (s: string) => s.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "visit";

/**
 * Check-in photo into the org's Google Drive, when the org switched that on
 * (Settings > Backup & Google). Answers { stored: "none" } otherwise, or if
 * Drive fails, and the app then keeps the photo in Supabase storage, so a
 * proof is never lost. Only the visit's own rep can attach its photo.
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, "field-proof", 30, 60_000);
  if (limited) return limited;
  const { errorResponse, user, profile, supabase } = await getAuthenticatedSession();
  if (errorResponse) return errorResponse;

  const form = await req.formData().catch(() => null);
  const visitId = String(form?.get("visitId") || "");
  const photo = form?.get("photo");
  if (!UUID.test(visitId) || !(photo instanceof Blob) || photo.size === 0 || photo.size > MAX_BYTES || !/^image\/jpe?g$/.test(photo.type)) {
    return NextResponse.json({ error: "A JPEG photo up to 3 MB and a visit are required" }, { status: 400 });
  }

  // Read through the rep's own session: row security decides it exists for them.
  const { data: visit } = await supabase!.from("visits").select("id, owner_id, org_id, party_name").eq("id", visitId).maybeSingle();
  if (!visit || visit.owner_id !== user!.id) return NextResponse.json({ error: "Visit not found" }, { status: 404 });

  const conn = await getOrgGoogle(visit.org_id);
  if (!conn?.field_photos_to_drive) return NextResponse.json({ stored: "none" });

  try {
    const when = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
    const fileId = await uploadFieldPhoto(conn, Buffer.from(await photo.arrayBuffer()), `${when} ${safe(profile?.name || "rep")} - ${safe(visit.party_name)}.jpg`);
    const { error } = await createAdminClient().from("visits").update({ check_in_photo_drive_id: fileId }).eq("id", visit.id).eq("org_id", visit.org_id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ stored: "drive" });
  } catch (e) {
    console.error("field proof to Drive failed", { org: visit.org_id, error: String((e as Error)?.message).slice(0, 200) });
    return NextResponse.json({ stored: "none", error: "Google Drive didn't accept the photo; saved in the app instead." });
  }
}

/** Streams a Drive-stored check-in photo to anyone who may see that visit. */
export async function GET(req: NextRequest) {
  const { errorResponse, supabase } = await getAuthenticatedSession();
  if (errorResponse) return errorResponse;
  const visitId = req.nextUrl.searchParams.get("visit") || "";
  if (!UUID.test(visitId)) return NextResponse.json({ error: "Bad visit" }, { status: 400 });

  const { data: visit } = await supabase!.from("visits").select("org_id, check_in_photo_drive_id").eq("id", visitId).maybeSingle();
  if (!visit?.check_in_photo_drive_id) return NextResponse.json({ error: "No photo" }, { status: 404 });
  const conn = await getOrgGoogle(visit.org_id);
  if (!conn) return NextResponse.json({ error: "Google Drive is no longer connected" }, { status: 409 });

  try {
    const bytes = await readDriveFile(conn, visit.check_in_photo_drive_id);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return NextResponse.json({ error: "The photo is no longer in Google Drive" }, { status: 404 });
  }
}
