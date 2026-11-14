import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quote", robots: { index: false, follow: false } };

type Line = { id: string; description: string; hsn: string | null; qty: number; unit_price: number; discount_pct: number; tax_rate: number; line_total: number };

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Printable quote (browser "Save as PDF"). Read strictly with the viewer's
 * own session (never the service key), so row security decides access.
 */
export default async function PrintQuote({ params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) notFound();
  const store = cookies();
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

  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-[13px] text-black print:p-0">
      <div className="flex justify-between gap-6 print:hidden mb-6"><PrintButton /></div>
      <header className="flex justify-between gap-6 border-b pb-4">
        <div>
          <h1 className="text-xl font-bold">{seller.legal_name || org?.name}</h1>
          {seller.address && <p className="whitespace-pre-line text-black/70">{seller.address}</p>}
          <p className="text-black/70">{[seller.phone, seller.email].filter(Boolean).join(" · ")}</p>
          {seller.gstin && <p>GSTIN: {seller.gstin}</p>}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tracking-tight">Quotation</div>
          <div>{q.number}</div>
          <div>Date: {new Date(q.issue_date).toLocaleDateString("en-IN")}</div>
          {q.valid_until && <div>Valid until: {new Date(q.valid_until).toLocaleDateString("en-IN")}</div>}
        </div>
      </header>
      <section className="py-4">
        <div className="text-[11px] uppercase tracking-wider text-black/50">Bill to</div>
        <div className="font-semibold">{q.customer_name}</div>
        {q.customer_address && <p className="whitespace-pre-line text-black/70">{q.customer_address}</p>}
        {q.customer_gstin && <p>GSTIN: {q.customer_gstin}</p>}
      </section>
      <table className="w-full border-collapse">
        <thead><tr className="border-y text-left text-[11px] uppercase tracking-wider text-black/60">
          <th className="py-2">Item</th><th className="py-2">HSN</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Rate</th>
          <th className="py-2 text-right">Disc</th><th className="py-2 text-right">GST</th><th className="py-2 text-right">Amount</th>
        </tr></thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id} className="border-b align-top">
              <td className="py-2 pr-2">{l.description}</td><td className="py-2">{l.hsn || ""}</td>
              <td className="py-2 text-right tabular-nums">{Number(l.qty)}</td><td className="py-2 text-right tabular-nums">{inr(l.unit_price)}</td>
              <td className="py-2 text-right tabular-nums">{Number(l.discount_pct) ? `${Number(l.discount_pct)}%` : ""}</td>
              <td className="py-2 text-right tabular-nums">{Number(l.tax_rate)}%</td><td className="py-2 text-right tabular-nums">{inr(l.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto mt-4 w-64 space-y-1 tabular-nums">
        <div className="flex justify-between"><span>Subtotal</span><span>{inr(q.subtotal)}</span></div>
        <div className="flex justify-between"><span>GST</span><span>{inr(q.tax_total)}</span></div>
        <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Total</span><span>{inr(q.total)}</span></div>
      </div>
      {q.terms && <section className="mt-8"><div className="text-[11px] uppercase tracking-wider text-black/50">Terms</div><p className="whitespace-pre-line">{q.terms}</p></section>}
      {q.notes && <section className="mt-4"><div className="text-[11px] uppercase tracking-wider text-black/50">Notes</div><p className="whitespace-pre-line">{q.notes}</p></section>}
    </main>
  );
}
