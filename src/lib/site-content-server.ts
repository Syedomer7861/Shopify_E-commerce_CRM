import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase";
import { resolveContent, type ContentKey, type ContentValue } from "@/lib/site-content";

export const SITE_CONTENT_TAG = "site-content";

// One query for every published key, cached for 5 minutes and dropped on
// publish (see /api/superadmin/content/revalidate). Server only: uses the
// service key, and only ever selects published values, never drafts.
const loadPublished = unstable_cache(
  async () => {
    const { data, error } = await createAdminClient().from("platform_content").select("key, published").not("published", "is", null);
    if (error) throw error;
    return Object.fromEntries((data || []).map(r => [r.key as string, r.published]));
  },
  ["site-content-published"],
  { tags: [SITE_CONTENT_TAG], revalidate: 300 },
);

/** Published content for a key, or the built-in text. Never throws, so a database problem can't take a page down. */
export async function getSiteContent<K extends ContentKey>(key: K): Promise<ContentValue<K>> {
  try {
    return resolveContent(key, (await loadPublished())[key]);
  } catch {
    return resolveContent(key, null);
  }
}
