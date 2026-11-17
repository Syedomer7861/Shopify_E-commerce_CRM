import "server-only";
import type { createAdminClient } from "@/lib/supabase";
import { dedupe, type PunchRow } from "@/lib/biometric";

type Admin = ReturnType<typeof createAdminClient>;

/** Stores punches for one org, ignoring ones already stored. Returns how many rows were sent. */
export async function storePunches(admin: Admin, orgId: string, deviceId: string | null, source: "device" | "agent", rows: PunchRow[]) {
  const batch = dedupe(rows).map(r => ({ ...r, org_id: orgId, device_id: deviceId, source }));
  if (!batch.length) return { count: 0, error: null as string | null };
  const { error } = await admin.from("biometric_punches")
    .upsert(batch, { onConflict: "org_id,employee_code,punched_at", ignoreDuplicates: true });
  if (error) {
    console.error("[biometric] store failed:", error.message);
    return { count: 0, error: "Could not store punches" };
  }
  if (deviceId) {
    const last = batch.reduce((m, r) => (r.punched_at > m ? r.punched_at : m), batch[0].punched_at);
    await admin.from("biometric_devices").update({ last_punch_at: last }).eq("id", deviceId);
  }
  return { count: batch.length, error: null as string | null };
}
