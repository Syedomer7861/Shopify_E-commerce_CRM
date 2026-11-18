"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";

// One fetch per org for the whole session; the name rarely changes.
const cache = new Map<string, Promise<string | null>>();

/** The signed-in user's organisation name, or null while loading / unknown. */
export function useOrgName(): string | null {
  const { profile } = useCurrentProfile();
  const orgId = profile?.org_id;
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let live = true;
    if (!cache.has(orgId)) {
      cache.set(orgId, Promise.resolve(createClient().from("organizations").select("name").eq("id", orgId).maybeSingle())
        .then(({ data }) => (data?.name as string) || null, () => null));
    }
    cache.get(orgId)!.then(n => { if (live) setName(n); });
    return () => { live = false; };
  }, [orgId]);

  return name;
}
