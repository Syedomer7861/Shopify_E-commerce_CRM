import { createAdminClient } from "./supabase";

// Per server instance, so a cron sending to many customers looks the org up once.
const cache = new Map<string, { at: number; name: Promise<string | null> }>();
const TTL_MS = 10 * 60_000;

/** An organisation's display name (server only), or null if unknown. Used to brand outgoing messages. */
export function orgNameFor(orgId: string | null | undefined): Promise<string | null> {
  if (!orgId) return Promise.resolve(null);
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.name;
  const name = Promise.resolve(createAdminClient().from("organizations").select("name").eq("id", orgId).maybeSingle())
    .then(({ data }) => (data?.name as string) || null, () => null);
  cache.set(orgId, { at: Date.now(), name });
  return name;
}
