import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { QuoteDocument, type QuoteLine } from "@/components/quotes/QuoteDocument";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quotation", robots: { index: false, follow: false } };

const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

/**
 * Public quote link sent to the customer (WhatsApp, email). No session: the
 * anon key can only call get_shared_quote, which returns customer-facing
 * fields for the one quote whose share token matches.
 */
export default async function SharedQuote(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  if (!TOKEN.test(token)) notFound();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await supabase.rpc("get_shared_quote", { p_token: token });
  if (!data?.quote) notFound();
  return (
    <QuoteDocument q={data.quote} rows={(data.lines || []) as QuoteLine[]}
      seller={(data.seller || {}) as Record<string, string>} orgName={data.org_name} />
  );
}
