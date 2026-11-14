"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Loader2, Plus, Printer, Receipt, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader, EmptyState, Modal, AccessDenied } from "@/components/ui";
import { ModuleTabs } from "@/components/records/RecordsModule";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { can } from "@/lib/access";
import { isAdmin } from "@/lib/permissions";

type Quote = {
  id: string; number: string; deal_id: string | null; customer_name: string; customer_email: string | null; customer_gstin: string | null;
  customer_address: string | null; issue_date: string; valid_until: string | null; status: string; notes: string | null; terms: string | null;
  subtotal: number; tax_total: number; total: number; invoice_id: string | null; owner_id: string | null; created_at: string;
};
type Line = { id: string; product_id: string | null; description: string; hsn: string | null; qty: number; unit_price: number; discount_pct: number; tax_rate: number; line_total: number; sort_order: number };
type Product = { id: string; name: string; sku: string | null; hsn: string | null; unit_price: number; tax_rate: number; is_active: boolean };

const STATUSES = ["draft", "sent", "accepted", "rejected"];
const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: string, fallback = 0) => { const n = Number(v); return Number.isFinite(n) && v.trim() !== "" ? n : fallback; };

export default function QuotesPage() {
  const { profile, loading } = useCurrentProfile();
  const [tab, setTab] = useState<"quotes" | "products" | "company">("quotes");
  if (loading) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
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

  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />;
  return (
    <div>
      <div className="flex justify-end mb-3">
        {canCreate && <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-1.5 text-xs"><Plus className="w-3.5 h-3.5" /> New quote</button>}
      </div>
      {quotes.length === 0 ? <EmptyState icon={<FileText className="w-6 h-6" />} title="No quotes yet" desc={canCreate ? "Create your first quote." : "Nothing you have access to here."} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead><tr className="text-left text-[10px] uppercase tracking-widest text-gray-400 border-b border-gray-100">
              <th className="p-3">Number</th><th className="p-3">Customer</th><th className="p-3">Date</th><th className="p-3 text-right">Total</th><th className="p-3">Status</th>
            </tr></thead>
            <tbody>
              {quotes.map(q => (
                <tr key={q.id} onClick={() => setOpenId(q.id)} className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-[#f7f4ed]">
                  <td className="p-3 font-semibold">{q.number}</td>
                  <td className="p-3">{q.customer_name}</td>
                  <td className="p-3 text-gray-500">{new Date(q.issue_date).toLocaleDateString()}</td>
                  <td className="p-3 text-right tabular-nums">{inr(q.total)}</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-600">{q.status}</span></td>
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

function NewQuote({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const { profile } = useCurrentProfile();
  const [deals, setDeals] = useState<{ id: string; title: string }[]>([]);
  const [form, setForm] = useState({ customer_name: "", customer_email: "", customer_gstin: "", customer_address: "", deal_id: "", valid_until: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.from("deals").select("id,title").not("status", "in", "(won,lost)").order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => setDeals((data || []) as { id: string; title: string }[]));
  }, [supabase]);

  async function create() {
    if (!form.customer_name.trim()) return toast.error("Customer name is required");
    setBusy(true);
    const id = crypto.randomUUID();
    const { data: org } = await supabase.from("organizations").select("billing_details").eq("id", profile?.org_id ?? "").maybeSingle();
    const terms = (org?.billing_details as { quote_terms?: string } | null)?.quote_terms || null;
    const { error } = await supabase.from("quotes").insert({
      id, number: "auto", owner_id: profile?.id, customer_name: form.customer_name.trim(), customer_email: form.customer_email.trim() || null,
      customer_gstin: form.customer_gstin.trim().toUpperCase() || null, customer_address: form.customer_address.trim() || null,
      deal_id: form.deal_id || null, valid_until: form.valid_until || null, terms,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    onCreated(id);
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="New quote" footer={<button onClick={create} disabled={busy} className="btn-primary w-full py-2.5">{busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Create quote"}</button>}>
      <div className="space-y-3">
        <label className="block text-xs font-medium text-gray-700">Customer name *<input className="input mt-1" maxLength={160} value={form.customer_name} onChange={set("customer_name")} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-gray-700">Email<input className="input mt-1" type="email" maxLength={160} value={form.customer_email} onChange={set("customer_email")} /></label>
          <label className="block text-xs font-medium text-gray-700">GSTIN<input className="input mt-1" maxLength={15} value={form.customer_gstin} onChange={set("customer_gstin")} /></label>
        </div>
        <label className="block text-xs font-medium text-gray-700">Address<textarea className="input mt-1 min-h-[60px]" maxLength={500} value={form.customer_address} onChange={set("customer_address")} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-gray-700">Deal (optional)
            <select className="input mt-1" value={form.deal_id} onChange={set("deal_id")}><option value="">None</option>{deals.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select>
          </label>
          <label className="block text-xs font-medium text-gray-700">Valid until<input className="input mt-1" type="date" value={form.valid_until} onChange={set("valid_until")} /></label>
        </div>
      </div>
    </Modal>
  );
}

function QuoteEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ product_id: "", description: "", hsn: "", qty: "1", unit_price: "", discount_pct: "0", tax_rate: "18" });

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
    setDraft({ product_id: "", description: "", hsn: "", qty: "1", unit_price: "", discount_pct: "0", tax_rate: "18" });
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
    if (!window.confirm("Create an invoice from this quote? The quote can no longer be changed afterwards.")) return;
    setBusy(true);
    const { error } = await supabase.rpc("quote_to_invoice", { p_quote: id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Invoice created in Finance");
    load();
  }

  async function removeQuote() {
    if (!window.confirm("Delete this quote? This cannot be undone.")) return;
    const { error } = await supabase.from("quotes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={quote ? `${quote.number} · ${quote.customer_name}` : "Quote"}>
      {!quote ? <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" /> : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {locked ? <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase">Invoiced</span> : (
              <select className="input w-auto text-xs" value={quote.status} onChange={e => setStatus(e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <Link href={`/quotes/${id}/print`} target="_blank" className="btn-secondary text-xs inline-flex items-center gap-1"><Printer className="w-3.5 h-3.5" /> Print / PDF</Link>
            {!locked && <button onClick={toInvoice} disabled={busy || lines.length === 0} className="btn-secondary text-xs inline-flex items-center gap-1 disabled:opacity-40"><Receipt className="w-3.5 h-3.5" /> Make invoice</button>}
            {!locked && <button onClick={removeQuote} className="ml-auto text-xs text-rose-600">Delete</button>}
          </div>

          <div className="divide-y divide-[#eceae4] border border-[#eceae4] rounded-lg">
            {lines.length === 0 && <p className="p-3 text-xs text-gray-500">No items yet.</p>}
            {lines.map(l => (
              <div key={l.id} className="p-3 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{l.description}</div>
                  <div className="text-[11px] text-gray-500">{l.qty} × {inr(l.unit_price)}{l.discount_pct > 0 ? ` − ${l.discount_pct}%` : ""} · GST {l.tax_rate}%{l.hsn ? ` · HSN ${l.hsn}` : ""}</div>
                </div>
                <div className="tabular-nums">{inr(l.line_total)}</div>
                {!locked && <button onClick={() => removeLine(l)} aria-label="Remove item" className="text-gray-300 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>}
              </div>
            ))}
          </div>

          {!locked && (
            <div className="rounded-lg bg-[#f7f4ed] p-3 space-y-2">
              {products.length > 0 && (
                <select className="input text-xs" value={draft.product_id} onChange={e => pickProduct(e.target.value)}>
                  <option value="">Pick a product, or type below</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""} · {inr(p.unit_price)}</option>)}
                </select>
              )}
              <input className="input text-xs" placeholder="Item description" maxLength={300} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
              <div className="grid grid-cols-5 gap-2">
                <label className="text-[10px] text-gray-500">Qty<input className="input text-xs" inputMode="decimal" value={draft.qty} onChange={e => setDraft({ ...draft, qty: e.target.value })} /></label>
                <label className="text-[10px] text-gray-500">Price ₹<input className="input text-xs" inputMode="decimal" value={draft.unit_price} onChange={e => setDraft({ ...draft, unit_price: e.target.value })} /></label>
                <label className="text-[10px] text-gray-500">Disc %<input className="input text-xs" inputMode="decimal" value={draft.discount_pct} onChange={e => setDraft({ ...draft, discount_pct: e.target.value })} /></label>
                <label className="text-[10px] text-gray-500">GST %<input className="input text-xs" inputMode="decimal" value={draft.tax_rate} onChange={e => setDraft({ ...draft, tax_rate: e.target.value })} /></label>
                <label className="text-[10px] text-gray-500">HSN<input className="input text-xs" maxLength={12} value={draft.hsn} onChange={e => setDraft({ ...draft, hsn: e.target.value })} /></label>
              </div>
              <button onClick={addLine} disabled={busy} className="btn-primary text-xs w-full">{busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Add item"}</button>
            </div>
          )}

          <div className="text-right space-y-1 tabular-nums">
            <div className="text-gray-500">Subtotal {inr(quote.subtotal)}</div>
            <div className="text-gray-500">GST {inr(quote.tax_total)}</div>
            <div className="text-lg font-bold">Total {inr(quote.total)}</div>
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
          <label className="col-span-2 text-[10px] text-gray-500">Product or service<input className="input text-xs" maxLength={160} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label className="text-[10px] text-gray-500">SKU<input className="input text-xs" maxLength={60} value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} /></label>
          <label className="text-[10px] text-gray-500">HSN/SAC<input className="input text-xs" maxLength={12} value={form.hsn} onChange={e => setForm({ ...form, hsn: e.target.value })} /></label>
          <label className="text-[10px] text-gray-500">Price ₹<input className="input text-xs" inputMode="decimal" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })} /></label>
          <label className="text-[10px] text-gray-500">GST %<input className="input text-xs" inputMode="decimal" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} /></label>
          <button onClick={add} disabled={busy} className="btn-primary text-xs col-span-2 sm:col-span-6">Add product</button>
        </div>
      )}
      {rows.length === 0 ? <EmptyState icon={<FileText className="w-6 h-6" />} title="No products yet" desc="Products fill quote lines with the right price and GST." /> : (
        <div className="card divide-y divide-[#eceae4]">
          {rows.map(p => (
            <div key={p.id} className={"p-3 flex items-center gap-3 text-sm" + (p.is_active ? "" : " opacity-50")}>
              <div className="flex-1 min-w-0"><div className="font-medium">{p.name}</div><div className="text-[11px] text-gray-500">{[p.sku, p.hsn && `HSN ${p.hsn}`, `GST ${p.tax_rate}%`].filter(Boolean).join(" · ")}</div></div>
              <div className="tabular-nums">{inr(p.unit_price)}</div>
              {canEdit && <button onClick={() => toggle(p)} className="text-[11px] font-semibold text-gray-500">{p.is_active ? "Archive" : "Restore"}</button>}
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
      <p className="text-xs text-gray-500">Shown at the top of printed quotes.</p>
      <label className="block text-xs font-medium text-gray-700">Legal name<input className="input mt-1" maxLength={160} value={d.legal_name} onChange={set("legal_name")} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-medium text-gray-700">GSTIN<input className="input mt-1" maxLength={15} value={d.gstin} onChange={set("gstin")} /></label>
        <label className="block text-xs font-medium text-gray-700">Phone<input className="input mt-1" maxLength={40} value={d.phone} onChange={set("phone")} /></label>
      </div>
      <label className="block text-xs font-medium text-gray-700">Email<input className="input mt-1" maxLength={160} value={d.email} onChange={set("email")} /></label>
      <label className="block text-xs font-medium text-gray-700">Address<textarea className="input mt-1 min-h-[60px]" maxLength={500} value={d.address} onChange={set("address")} /></label>
      <label className="block text-xs font-medium text-gray-700">Default terms on new quotes<textarea className="input mt-1 min-h-[80px]" maxLength={2000} value={d.quote_terms} onChange={set("quote_terms")} /></label>
      <button onClick={save} disabled={busy} className="btn-primary text-xs">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</button>
    </div>
  );
}
