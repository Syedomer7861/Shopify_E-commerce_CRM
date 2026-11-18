import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { QuoteDocument, type QuoteLine as Line } from "@/components/quotes/QuoteDocument";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quote", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Printable quote (browser "Save as PDF"). Read strictly with the viewer's
 * own session (never the service key), so row security decides access.
 */
export default async function PrintQuote(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!UUID.test(params.id)) notFound();
  const store = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { get: (name: string) => store.get(name)?.value, set: () => {}, remove: () => {} },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: q }, { data: lines }] = await Promise.all([
    supabase.from("quotes").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("quote_lines").select("*").eq("quote_id", params.id).order("sort_order"),
  ]);
  if (!q) notFound();
  const { data: org } = await supabase.from("organizations").select("name, billing_details").eq("id", q.org_id).maybeSingle();
  const seller = (org?.billing_details || {}) as Record<string, string>;
  const rows = (lines || []) as Line[];

  return <QuoteDocument q={q} rows={rows} seller={seller} orgName={org?.name} />;
}
