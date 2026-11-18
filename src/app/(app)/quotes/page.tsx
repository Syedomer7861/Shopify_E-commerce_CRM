"use client";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Loader2, Plus, Printer, Receipt, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader, EmptyState, Modal, AccessDenied, Select } from "@/components/ui";
import { ShareMenu } from "@/components/ShareMenu";
import { ModuleTabs } from "@/components/records/RecordsModule";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { can } from "@/lib/access";
import { isAdmin } from "@/lib/permissions";

type Quote = {
  id: string; number: string; deal_id: string | null; customer_name: string; customer_email: string | null; customer_gstin: string | null;
  customer_address: string | null; issue_date: string; valid_until: string | null; status: string; notes: string | null; terms: string | null;
  subtotal: number; tax_total: number; total: number; invoice_id: string | null; owner_id: string | null; created_at: string;
  share_token?: string | null;
};
type Line = { id: string; product_id: string | null; description: string; hsn: string | null; qty: number; unit_price: number; discount_pct: number; tax_rate: number; line_total: number; sort_order: number };
type Product = { id: string; name: string; sku: string | null; hsn: string | null; unit_price: number; tax_rate: number; is_active: boolean };

const STATUSES = ["draft", "sent", "accepted", "rejected"];
const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: string, fallback = 0) => { const n = Number(v); return Number.isFinite(n) && v.trim() !== "" ? n : fallback; };

export default function QuotesPage() {
  const { profile, loading } = useCurrentProfile();
  const [tab, setTab] = useState<"quotes" | "products" | "company">("quotes");
  if (loading) return <div className="py-12 text-center text-[#9a9a94]"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  if (!profile || can(profile, "deals", "view") === null) return <AccessDenied />;
  const tabs = [{ key: "quotes" as const, label: "Quotes" }, { key: "products" as const, label: "Products" }, ...(isAdmin(profile) ? [{ key: "company" as const, label: "Company details" }] : [])];
  return (
    <div className="animate-fade-in">
      <PageHeader title="Quotes" subtitle="Price offers with GST. Accepted quotes become invoices in one click." />
      <ModuleTabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === "quotes" && <QuotesList canCreate={can(profile, "deals", "create") !== null} />}
      {tab === "products" && <Products canEdit={isAdmin(profile) || can(profile, "deals", "edit") !== null} />}
      {tab === "company" && <CompanyDetails />}
    </div>
  );
}

function QuotesList({ canCreate }: { canCreate: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("quotes").select("*").order("created_at", { ascending: false }).limit(300);
    if (error) toast.error(error.message);
    setQuotes((data || []) as Quote[]);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-[#9a9a94] mx-auto" />;
  return (
    <div>
      <div className="flex justify-end mb-3">
        {canCreate && <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-1.5 text-xs"><Plus className="w-3.5 h-3.5" /> New quote</button>}
      </div>
      {quotes.length === 0 ? <EmptyState icon={<FileText className="w-6 h-6" />} title="No quotes yet" desc={canCreate ? "Create your first quote." : "Nothing you have access to here."} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-[#9a9a94] border-b border-[#ebece6]">
              <th className="p-3">Number</th><th className="p-3">Customer</th><th className="p-3">Date</th><th className="p-3 text-right">Total</th><th className="p-3">Status</th>
            </tr></thead>
            <tbody>
              {quotes.map(q => (
                <tr key={q.id} onClick={() => setOpenId(q.id)} className="border-b border-[#f6f7f2] last:border-0 cursor-pointer hover:bg-[#f6f7f2]">
                  <td className="p-3 font-semibold">{q.number}</td>
                  <td className="p-3">{q.customer_name}</td>
                  <td className="p-3 text-[#6b6b67]">{new Date(q.issue_date).toLocaleDateString()}</td>
                  <td className="p-3 text-right tabular-nums">{inr(q.total)}</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded-full bg-[#f0f0ec] text-[10px] font-bold uppercase tracking-wider text-[#55554f]">{q.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <NewQuote onClose={() => setCreating(false)} onCreated={id => { setCreating(false); load(); setOpenId(id); }} />}
      {openId && <QuoteEditor id={openId} onClose={() => { setOpenId(null); load(); }} />}
    </div>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fieldLabel = "block text-[11px] font-semibold text-[#55554f] mb-1";
const sectionTitle = "text-[10px] font-bold uppercase tracking-wider text-[#9a9a94] mb-2";

function NewQuote({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const { profile } = useCurrentProfile();
  const [deals, setDeals] = useState<{ id: string; title: string }[] | null>(null);
  const [form, setForm] = useState({ customer_name: "", customer_email: "", customer_gstin: "", customer_address: "", deal_id: "", valid_until: plusDays(15) });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.from("deals").select("id,title").not("status", "in", "(won,lost)").order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => setDeals((data || []) as { id: string; title: string }[]));
  }, [supabase]);

  const email = form.customer_email.trim();
  const gstin = form.customer_gstin.trim().toUpperCase();
  const emailBad = email !== "" && !EMAIL.test(email);
  const gstinBad = gstin !== "" && !GSTIN.test(gstin);

  async function create() {
    if (!form.customer_name.trim()) return toast.error("Customer name is required");
    if (emailBad) return toast.error("Check the email address");
    if (gstinBad) return toast.error("GSTIN should look like 27ABCDE1234F1Z5");
    setBusy(true);
    const id = crypto.randomUUID();
    const { data: org } = await supabase.from("organizations").select("billing_details").eq("id", profile?.org_id ?? "").maybeSingle();
    const terms = (org?.billing_details as { quote_terms?: string } | null)?.quote_terms || null;
    const { error } = await supabase.from("quotes").insert({
      id, number: "auto", owner_id: profile?.id, customer_name: form.customer_name.trim(), customer_email: email || null,
      customer_gstin: gstin || null, customer_address: form.customer_address.trim() || null,
      deal_id: form.deal_id || null, valid_until: form.valid_until || null, terms,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    onCreated(id);
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const setVal = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });

  return (
    <Modal open onClose={onClose} title="New quote" maxWidth="max-w-2xl"
      footer={
        <div className="flex w-full gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary text-xs px-4">Cancel</button>
          <button onClick={create} disabled={busy} className="btn-primary text-xs px-5 min-w-[130px]">{busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Create & add items"}</button>
        </div>
      }>
      <div className="space-y-5">
        <section>
          <div className={sectionTitle}>Customer</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="nq-name" className={fieldLabel}>Customer name *</label>
              <input id="nq-name" className="input" maxLength={160} autoFocus placeholder="Person or company" value={form.customer_name} onChange={set("customer_name")} />
            </div>
            <div>
              <label htmlFor="nq-email" className={fieldLabel}>Email</label>
              <input id="nq-email" className={"input" + (emailBad ? " border-rose-300" : "")} type="email" maxLength={160} placeholder="name@company.com" value={form.customer_email} onChange={set("customer_email")} />
              {emailBad && <p className="mt-1 text-[10px] text-rose-600">Doesn&apos;t look like an email</p>}
            </div>
            <div>
              <label htmlFor="nq-gstin" className={fieldLabel}>GSTIN</label>
              <input id="nq-gstin" className={"input uppercase" + (gstinBad ? " border-rose-300" : "")} maxLength={15} placeholder="27ABCDE1234F1Z5" value={form.customer_gstin} onChange={set("customer_gstin")} />
              {gstinBad && <p className="mt-1 text-[10px] text-rose-600">15 characters, e.g. 27ABCDE1234F1Z5</p>}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="nq-addr" className={fieldLabel}>Billing address</label>
              <textarea id="nq-addr" className="input min-h-[64px]" maxLength={500} placeholder="Street, city, state, PIN" value={form.customer_address} onChange={set("customer_address")} />
            </div>
          </div>
        </section>
        <section className="border-t border-[#ebece6] pt-4">
          <div className={sectionTitle}>Quote details</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className={fieldLabel}>Linked deal</span>
              {deals === null ? <div className="input text-[#9a9a94] flex items-center"><Loader2 className="w-3.5 h-3.5 animate-spin" /></div>
                : deals.length === 0 ? <div className="input text-xs text-[#9a9a94] flex items-center">No open deals</div>
                : <Select value={form.deal_id || "__none"} onChange={v => setVal("deal_id")(v === "__none" ? "" : v)}
                    options={[{ value: "__none", label: "No deal" }, ...deals.map(d => ({ value: d.id, label: d.title }))]} />}
            </div>
            <div>
              <label htmlFor="nq-valid" className={fieldLabel}>Valid until</label>
              <input id="nq-valid" className="input" type="date" value={form.valid_until} onChange={set("valid_until")} />
              <div className="mt-1.5 flex gap-1">
                {[7, 15, 30].map(n => (
                  <button key={n} type="button" onClick={() => setVal("valid_until")(plusDays(n))}
                    className={"px-2 py-0.5 rounded-full border text-[10px] font-bold " + (form.valid_until === plusDays(n) ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "border-[#ebece6] text-[#55554f]")}>
                    {n} days
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}

/** Random URL-safe token for a public quote link (24 bytes, 32 chars). */
function newShareToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const STATUS_HINT: Record<string, string> = { draft: "Not sent yet", sent: "Waiting on customer", accepted: "Ready to invoice", rejected: "Customer declined" };

function QuoteEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const blank = { product_id: "", description: "", hsn: "", qty: "1", unit_price: "", discount_pct: "0", tax_rate: "18" };
  const [draft, setDraft] = useState(blank);

  const load = useCallback(async () => {
    const [q, l] = await Promise.all([
      supabase.from("quotes").select("*").eq("id", id).maybeSingle(),
      supabase.from("quote_lines").select("*").eq("quote_id", id).order("sort_order"),
    ]);
    if (q.error) toast.error(q.error.message);
    setQuote(q.data as Quote | null);
    setLines((l.data || []) as Line[]);
  }, [supabase, id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    supabase.from("products").select("*").eq("is_active", true).order("name").then(({ data }) => setProducts((data || []) as Product[]));
  }, [supabase]);

  const locked = quote?.status === "invoiced";
  // Same maths as the database trigger, shown before the item is added.
  const preview = (() => {
    const qty = num(draft.qty, 0), price = num(draft.unit_price, 0), disc = num(draft.discount_pct), tax = num(draft.tax_rate);
    const base = qty * price * (1 - disc / 100);
    return base + base * tax / 100;
  })();

  function pickProduct(pid: string) {
    const p = products.find(x => x.id === pid);
    setDraft(d => p ? { ...d, product_id: pid, description: p.name, hsn: p.hsn || "", unit_price: String(p.unit_price), tax_rate: String(p.tax_rate) } : { ...d, product_id: "" });
  }

  async function addLine() {
    if (!draft.description.trim()) return toast.error("Describe the item");
    const qty = num(draft.qty, 0), price = num(draft.unit_price, -1), disc = num(draft.discount_pct), tax = num(draft.tax_rate);
    if (qty <= 0 || price < 0 || disc < 0 || disc > 100 || tax < 0 || tax > 100) return toast.error("Check quantity, price, discount and GST");
    setBusy(true);
    const { error } = await supabase.from("quote_lines").insert({
      id: crypto.randomUUID(), quote_id: id, product_id: draft.product_id || null, description: draft.description.trim(), hsn: draft.hsn.trim() || null,
      qty, unit_price: price, discount_pct: disc, tax_rate: tax, sort_order: lines.length,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setDraft(blank);
    load();
  }

  async function removeLine(l: Line) {
    const { error } = await supabase.from("quote_lines").delete().eq("id", l.id);
    if (error) return toast.error(error.message);
    load();
  }

  async function setStatus(status: string) {
    const { error } = await supabase.from("quotes").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  async function toInvoice() {
    if (!await confirmDialog("Create an invoice from this quote? The quote can no longer be changed afterwards.")) return;
    setBusy(true);
    const { error } = await supabase.rpc("quote_to_invoice", { p_quote: id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Invoice created in Finance");
    load();
  }

  async function removeQuote() {
    if (!await confirmDialog("Delete this quote? This cannot be undone.")) return;
    const { error } = await supabase.from("quotes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    onClose();
  }

  /** Makes (or reuses) the public link. Sharing a draft marks it sent. */
  async function prepareShare(): Promise<string | null> {
    if (!quote) return null;
    if (lines.length === 0) { toast.error("Add at least one item before sharing"); return null; }
    let token = quote.share_token;
    if (!token) {
      token = newShareToken();
      const change: Record<string, unknown> = { share_token: token, shared_at: new Date().toISOString() };
      if (quote.status === "draft") change.status = "sent";
      const { error } = await supabase.from("quotes").update(change).eq("id", id);
      if (error) {
        toast.error(/share_token/.test(error.message) ? "Sharing isn't switched on yet. Ask your admin to finish the update." : error.message);
        return null;
      }
      load();
    }
    return `${window.location.origin}/q/${token}`;
  }

  async function revokeShare() {
    const { error } = await supabase.from("quotes").update({ share_token: null, shared_at: null }).eq("id", id);
    if (error) return void toast.error(error.message);
    toast.success("Link turned off. Anyone with the old link can no longer open it.");
    load();
  }

  return (
    <Modal open onClose={onClose} maxWidth="max-w-3xl"
      title={quote ? <span className="flex items-center gap-2">{quote.number}<span className="text-[#9a9a94] font-normal">·</span><span className="truncate">{quote.customer_name}</span></span> : "Quote"}>
      {!quote ? <Loader2 className="w-5 h-5 animate-spin text-[#9a9a94] mx-auto" /> : (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {locked ? <span className="px-2.5 py-1 rounded-full bg-[#f0f0ec] text-[#1c1c1c] text-[10px] font-bold uppercase tracking-wider">Invoiced · locked</span> : (
              <div role="radiogroup" aria-label="Quote status" className="inline-flex rounded-lg border border-[#ebece6] bg-[#f6f7f2] p-0.5">
                {STATUSES.map(s => (
                  <button key={s} role="radio" aria-checked={quote.status === s} onClick={() => quote.status !== s && setStatus(s)} title={STATUS_HINT[s]}
                    className={"px-2.5 py-1 rounded-md text-[11px] font-bold capitalize " + (quote.status === s ? "bg-white text-[#1c1c1c] shadow-sm" : "text-[#6b6b67] hover:text-[#1c1c1c]")}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <ShareMenu prepare={prepareShare} onRevoke={quote.share_token ? revokeShare : undefined}
                email={quote.customer_email} subject={`Quotation ${quote.number}`}
                message={`Hi ${quote.customer_name}, here is quotation ${quote.number} for ${inr(quote.total)}${quote.valid_until ? `, valid until ${new Date(quote.valid_until).toLocaleDateString("en-IN")}` : ""}.`} />
              <Link href={`/quotes/${id}/print`} target="_blank" className="btn-secondary text-xs inline-flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" /> Print / PDF</Link>
              {!locked && <button onClick={toInvoice} disabled={busy || lines.length === 0} className="btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-40"><Receipt className="w-3.5 h-3.5" /> Make invoice</button>}
              {!locked && <button onClick={removeQuote} aria-label="Delete quote" title="Delete quote" className="p-2 rounded-lg text-[#9a9a94] hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-[#ebece6] p-3 text-xs">
            <div className="col-span-2"><div className={sectionTitle + " mb-0.5"}>Bill to</div><div className="font-semibold text-[#1c1c1c]">{quote.customer_name}</div>
              <div className="text-[#6b6b67] truncate">{[quote.customer_email, quote.customer_gstin && `GSTIN ${quote.customer_gstin}`].filter(Boolean).join(" · ") || "No email or GSTIN"}</div></div>
            <div><div className={sectionTitle + " mb-0.5"}>Issued</div><div>{new Date(quote.issue_date).toLocaleDateString("en-IN")}</div></div>
            <div><div className={sectionTitle + " mb-0.5"}>Valid until</div><div>{quote.valid_until ? new Date(quote.valid_until).toLocaleDateString("en-IN") : "—"}</div></div>
          </div>

          <div className="rounded-xl border border-[#ebece6] overflow-x-auto">
            <table className="w-full text-xs min-w-[520px]">
              <thead><tr className="bg-[#f6f7f2] text-left text-[10px] uppercase tracking-wider text-[#9a9a94]">
                <th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Disc</th><th className="px-3 py-2 text-right">GST</th><th className="px-3 py-2 text-right">Amount</th><th className="w-8" />
              </tr></thead>
              <tbody>
                {lines.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-[#9a9a94]">No items yet. Add the first one below.</td></tr>}
                {lines.map(l => (
                  <tr key={l.id} className="border-t border-[#f0f0ec] align-top">
                    <td className="px-3 py-2"><div className="font-medium text-[#1c1c1c]">{l.description}</div>{l.hsn && <div className="text-[10px] text-[#9a9a94]">HSN {l.hsn}</div>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(l.qty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inr(l.unit_price)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#6b6b67]">{Number(l.discount_pct) ? `${Number(l.discount_pct)}%` : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#6b6b67]">{Number(l.tax_rate)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{inr(l.line_total)}</td>
                    <td className="px-2 py-2 text-right">{!locked && <button onClick={() => removeLine(l)} aria-label="Remove item" className="text-[#d4d5cd] hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!locked && (
            <div className="rounded-xl bg-[#f6f7f2] p-3 space-y-3">
              <div className="flex items-center justify-between"><div className={sectionTitle + " mb-0"}>Add item</div>
                {products.length > 0 && (
                  <div className="w-56"><Select value={draft.product_id || "__custom"} onChange={v => pickProduct(v === "__custom" ? "" : v)} triggerClassName="text-xs h-8"
                    options={[{ value: "__custom", label: "Custom item" }, ...products.map(p => ({ value: p.id, label: `${p.name}${p.sku ? ` (${p.sku})` : ""} · ${inr(p.unit_price)}` }))]} /></div>
                )}
              </div>
              <div>
                <label htmlFor="qe-desc" className={fieldLabel}>Description</label>
                <input id="qe-desc" className="input text-xs bg-white" placeholder="What are you quoting for?" maxLength={300} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {([["qty", "Qty"], ["unit_price", "Rate ₹"], ["discount_pct", "Disc %"], ["tax_rate", "GST %"]] as const).map(([k, lab]) => (
                  <div key={k}><label htmlFor={`qe-${k}`} className={fieldLabel}>{lab}</label>
                    <input id={`qe-${k}`} className="input text-xs bg-white tabular-nums" inputMode="decimal" value={draft[k]} onChange={e => setDraft({ ...draft, [k]: e.target.value })} /></div>
                ))}
                <div><label htmlFor="qe-hsn" className={fieldLabel}>HSN</label>
                  <input id="qe-hsn" className="input text-xs bg-white" maxLength={12} value={draft.hsn} onChange={e => setDraft({ ...draft, hsn: e.target.value })} /></div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-[#6b6b67]">Line total <span className="font-bold text-[#1c1c1c] tabular-nums">{inr(preview)}</span></span>
                <button onClick={addLine} disabled={busy} className="btn-primary text-xs px-4 inline-flex items-center gap-1.5">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add item</button>
              </div>
            </div>
          )}

          <div className="ml-auto w-full sm:w-64 rounded-xl border border-[#ebece6] p-3 space-y-1.5 tabular-nums text-xs">
            <div className="flex justify-between text-[#6b6b67]"><span>Subtotal</span><span>{inr(quote.subtotal)}</span></div>
            <div className="flex justify-between text-[#6b6b67]"><span>GST</span><span>{inr(quote.tax_total)}</span></div>
            <div className="flex justify-between border-t border-[#ebece6] pt-1.5 text-base font-bold text-[#1c1c1c]"><span>Total</span><span>{inr(quote.total)}</span></div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Products({ canEdit }: { canEdit: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Product[]>([]);
  const [form, setForm] = useState({ name: "", sku: "", hsn: "", unit_price: "", tax_rate: "18" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("products").select("*").order("is_active", { ascending: false }).order("name");
    if (error) toast.error(error.message);
    setRows((data || []) as Product[]);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    const price = num(form.unit_price, -1), tax = num(form.tax_rate, -1);
    if (!form.name.trim() || price < 0 || tax < 0 || tax > 100) return toast.error("Name, price and GST (0-100) are required");
    setBusy(true);
    const { error } = await supabase.from("products").insert({ id: crypto.randomUUID(), name: form.name.trim(), sku: form.sku.trim() || null, hsn: form.hsn.trim() || null, unit_price: price, tax_rate: tax });
    setBusy(false);
    if (error) return toast.error(error.message);
    setForm({ name: "", sku: "", hsn: "", unit_price: "", tax_rate: "18" });
    load();
  }
  async function toggle(p: Product) {
    const { error } = await supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="card p-3 grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
          <label className="col-span-2 text-[10px] text-[#6b6b67]">Product or service<input className="input text-xs" maxLength={160} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label className="text-[10px] text-[#6b6b67]">SKU<input className="input text-xs" maxLength={60} value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} /></label>
          <label className="text-[10px] text-[#6b6b67]">HSN/SAC<input className="input text-xs" maxLength={12} value={form.hsn} onChange={e => setForm({ ...form, hsn: e.target.value })} /></label>
          <label className="text-[10px] text-[#6b6b67]">Price ₹<input className="input text-xs" inputMode="decimal" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })} /></label>
          <label className="text-[10px] text-[#6b6b67]">GST %<input className="input text-xs" inputMode="decimal" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} /></label>
          <button onClick={add} disabled={busy} className="btn-primary text-xs col-span-2 sm:col-span-6">Add product</button>
        </div>
      )}
      {rows.length === 0 ? <EmptyState icon={<FileText className="w-6 h-6" />} title="No products yet" desc="Products fill quote lines with the right price and GST." /> : (
        <div className="card divide-y divide-[#ebece6]">
          {rows.map(p => (
            <div key={p.id} className={"p-3 flex items-center gap-3 text-sm" + (p.is_active ? "" : " opacity-50")}>
              <div className="flex-1 min-w-0"><div className="font-medium">{p.name}</div><div className="text-[11px] text-[#6b6b67]">{[p.sku, p.hsn && `HSN ${p.hsn}`, `GST ${p.tax_rate}%`].filter(Boolean).join(" · ")}</div></div>
              <div className="tabular-nums">{inr(p.unit_price)}</div>
              {canEdit && <button onClick={() => toggle(p)} className="text-[11px] font-semibold text-[#6b6b67]">{p.is_active ? "Archive" : "Restore"}</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompanyDetails() {
  const supabase = useMemo(() => createClient(), []);
  const { profile } = useCurrentProfile();
  const [d, setD] = useState({ legal_name: "", gstin: "", address: "", email: "", phone: "", quote_terms: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!profile?.org_id) return;
    supabase.from("organizations").select("billing_details").eq("id", profile.org_id).maybeSingle().then(({ data }) => {
      if (data?.billing_details) setD(prev => ({ ...prev, ...(data.billing_details as Record<string, string>) }));
    });
  }, [supabase, profile?.org_id]);
  async function save() {
    if (d.gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(d.gstin.trim().toUpperCase())) return toast.error("GSTIN should be 15 characters");
    setBusy(true);
    const { error } = await supabase.rpc("set_org_billing_details", { p_details: d });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
  }
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });
  return (
    <div className="card p-5 space-y-3 max-w-xl">
      <p className="text-xs text-[#6b6b67]">Shown at the top of printed quotes.</p>
      <label className="block text-xs font-medium text-[#3a3a36]">Legal name<input className="input mt-1" maxLength={160} value={d.legal_name} onChange={set("legal_name")} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-medium text-[#3a3a36]">GSTIN<input className="input mt-1" maxLength={15} value={d.gstin} onChange={set("gstin")} /></label>
        <label className="block text-xs font-medium text-[#3a3a36]">Phone<input type="tel" inputMode="tel" autoComplete="tel" className="input mt-1" maxLength={40} value={d.phone} onChange={set("phone")} /></label>
      </div>
      <label className="block text-xs font-medium text-[#3a3a36]">Email<input type="email" inputMode="email" autoComplete="email" className="input mt-1" maxLength={160} value={d.email} onChange={set("email")} /></label>
      <label className="block text-xs font-medium text-[#3a3a36]">Address<textarea className="input mt-1 min-h-[60px]" maxLength={500} value={d.address} onChange={set("address")} /></label>
      <label className="block text-xs font-medium text-[#3a3a36]">Default terms on new quotes<textarea className="input mt-1 min-h-[80px]" maxLength={2000} value={d.quote_terms} onChange={set("quote_terms")} /></label>
      <button onClick={save} disabled={busy} className="btn-primary text-xs">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</button>
    </div>
  );
}
