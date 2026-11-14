import "server-only";

/**
 * Whether Google sign-in is switched on in Supabase (Authentication >
 * Providers). Read from the project's public auth settings, cached for five
 * minutes, so the button appears by itself once Google is configured.
 */
export async function googleAuthEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      next: { revalidate: 300 },
    });
    if (!res.ok) return false;
    const s = (await res.json()) as { external?: { google?: boolean } };
    return s.external?.google === true;
  } catch {
    return false;
  }
}
