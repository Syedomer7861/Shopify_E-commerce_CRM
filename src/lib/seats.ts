import "server-only";
import type { createAdminClient } from "@/lib/supabase";

/**
 * Friendly pre-check before adding a team member. The database trigger
 * (trg_enforce_seat_limit) is the real guard; this only turns its refusal
 * into a clear message before an auth account is created. If the check
 * itself fails it returns null and lets the trigger decide.
 */
export async function seatLimitError(admin: ReturnType<typeof createAdminClient>, orgId: string): Promise<string | null> {
  const { data, error } = await admin.rpc("org_seat_status", { p_org: orgId });
  if (error || !data) return null;
  const { limit, used } = data as { limit: number | null; used: number };
  if (limit == null || used < limit) return null;
  return `Your plan includes ${limit} team members and all are in use. Deactivate a member or upgrade your plan.`;
}
