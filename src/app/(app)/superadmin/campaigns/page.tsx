"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Loader2, Megaphone, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader, EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { formatMinor, toMinor } from "@/lib/money";

type Campaign = {
  id: string; name: string; utm_source: string | null; utm_medium: string | null; utm_campaign: string;
  currency: string; starts_on: string | null; ends_on: string | null; notes: string; is_archived: boolean;
};
type Spend = { id: string; campaign_id: string; spend_date: string; amount_minor: number; source: string; note: string };
type ReportRow = { campaign_id: string; spend_minor: number; requests_first: number; requests_last: number; provisioned_first: number };

const input = "h-9 px-3 bg-white border border-[#eceae4] rounded-lg text-sm focus:outline-none focus:border-[#1c1c1c]/30";
const TAG = /^[a-z0-9][a-z0-9_.-]{0,99}$/;
const RANGES = [{ v: "30", l: "Last 30 days" }, { v: "90", l: "Last 90 days" }, { v: "365", l: "Last 12 months" }, { v: "all", l: "All time" }];
const today = () => new Date().toISOString().slice(0, 10);

function trackedLink(c: Campaign) {
  const q = new URLSearchParams({ ...(c.utm_source && { utm_source: c.utm_source }), ...(c.utm_medium && { utm_medium: c.utm_medium }), utm_campaign: c.utm_campaign });
  return `${window.location.origin}/?${q}`;
}

function SpendPanel({ c, spend, onChange }: { c: Campaign; spend: Spend[]; onChange: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState({ date: today(), amount: "", note: "" });
  const [busy, setBusy] = useState(false);

  async function add() {
    const amount = toMinor(form.amount);
    if (!amount) return toast.error("Enter an amount like 2500 or 2500.50");
    setBusy(true);
    const { error } = await supabase.rpc("platform_add_spend", { p_campaign: c.id, p_date: form.date, p_amount_minor: amount, p_note: form.note });
    setBusy(false);
    if (error) return toast.error(error.message);
    setForm({ ...form, amount: "", note: "" });
    onChange();
  }

  async function remove(s: Spend) {
    if (!window.confirm(`Delete ${formatMinor(s.amount_minor, c.currency)} on ${s.spend_date}?`)) return;
    const { error } = await supabase.rpc("platform_delete_spend", { p_id: s.id });
    if (error) return toast.error(error.message);
    onChange();
  }

  return (
    <div className="mt-3 border-t border-[#eceae4] pt-3 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[10px] text-[#5f5f5d]">Date<br /><input type="date" max={today()} className={cn(input, "w-40")} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
        <label className="text-[10px] text-[#5f5f5d]">Amount ({c.currency})<br /><input className={cn(input, "w-28")} inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label>
        <label className="text-[10px] text-[#5f5f5d] flex-1 min-w-[140px]">Note<br /><input className={cn(input, "w-full")} maxLength={500} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Google Ads invoice, week 46" /></label>
        <button onClick={add} disabled={busy} className="text-xs font-semibold px-3 py-2 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50">Add spend</button>
      </div>
      {spend.length === 0 ? <p className="text-xs text-[#5f5f5d]">No spend recorded.</p> : spend.map(s => (
        <div key={s.id} className="flex items-center gap-3 text-xs">
          <span className="w-24 text-[#5f5f5d]">{s.spend_date}</span>
          <span className="w-28 tabular-nums font-semibold">{formatMinor(s.amount_minor, c.currency)}</span>
          <span className="flex-1 min-w-0 truncate text-[#5f5f5d]">{s.note}</span>
          {s.source === "manual" && <button onClick={() => remove(s)} aria-label="Delete spend" className="p-1 text-[#5f5f5d] hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}
        </div>
      ))}
    </div>
  );
}

export default function SuperAdminCampaigns() {
  const supabase = useMemo(() => createClient(), []);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [spend, setSpend] = useState<Spend[]>([]);
  const [report, setReport] = useState<Record<string, ReportRow>>({});
  const [range, setRange] = useState("90");
  const [open, setOpen] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", source: "", medium: "", campaign: "", currency: "INR" });

  const load = useCallback(async () => {
    const from = range === "all" ? null : new Date(Date.now() - Number(range) * 86400000).toISOString().slice(0, 10);
    const [c, s, r] = await Promise.all([
      supabase.from("platform_campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("platform_ad_spend").select("*").order("spend_date", { ascending: false }),
      supabase.rpc("platform_campaign_report", { p_from: from, p_to: null }),
    ]);
    const err = c.error || s.error || r.error;
    if (err) toast.error(err.message);
    setCampaigns((c.data || []) as Campaign[]);
    setSpend((s.data || []) as Spend[]);
    setReport(Object.fromEntries(((r.data || []) as ReportRow[]).map(x => [x.campaign_id, x])));
  }, [supabase, range]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    const tags = { source: form.source.trim().toLowerCase(), medium: form.medium.trim().toLowerCase(), campaign: form.campaign.trim().toLowerCase() };
    if (!form.name.trim()) return toast.error("Name the campaign");
    if (!TAG.test(tags.campaign)) return toast.error("utm_campaign: lowercase letters, numbers, - _ or .");
    if ((tags.source && !TAG.test(tags.source)) || (tags.medium && !TAG.test(tags.medium))) return toast.error("Tags: lowercase letters, numbers, - _ or .");
    if (!/^[A-Z]{3}$/.test(form.currency)) return toast.error("Currency is a 3-letter code like INR");
    setBusy(true);
    const { error } = await supabase.rpc("platform_save_campaign", {
      p_id: null, p_name: form.name, p_utm_source: tags.source, p_utm_medium: tags.medium, p_utm_campaign: tags.campaign,
      p_currency: form.currency, p_starts_on: null, p_ends_on: null, p_notes: "", p_is_archived: false,
    });
    setBusy(false);
    if (error) return toast.error(error.message.includes("uq_platform_campaigns_tags") ? "A campaign with these tags exists" : error.message);
    toast.success("Campaign created");
    setForm({ ...form, name: "", source: "", medium: "", campaign: "" });
    load();
  }

  async function setArchived(c: Campaign, is_archived: boolean) {
    const { error } = await supabase.rpc("platform_save_campaign", {
      p_id: c.id, p_name: c.name, p_utm_source: c.utm_source, p_utm_medium: c.utm_medium, p_utm_campaign: c.utm_campaign,
      p_currency: c.currency, p_starts_on: c.starts_on, p_ends_on: c.ends_on, p_notes: c.notes, p_is_archived: is_archived,
    });
    if (error) return toast.error(error.message);
    load();
  }

  if (!campaigns) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  const shown = campaigns.filter(c => showArchived || !c.is_archived);

  return (
    <div>
      <PageHeader title="Campaigns" subtitle="Your own marketing campaigns. Spend is entered by hand; requests are matched by the UTM tags on the link visitors came in on." />

      <div className="card p-4 mb-4 flex flex-wrap items-end gap-2">
        <label className="text-[10px] text-[#5f5f5d] flex-1 min-w-[160px]">Name<br /><input className={cn(input, "w-full")} maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Diwali search ads" /></label>
        <label className="text-[10px] text-[#5f5f5d]">utm_source<br /><input className={cn(input, "w-28")} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="google" /></label>
        <label className="text-[10px] text-[#5f5f5d]">utm_medium<br /><input className={cn(input, "w-24")} value={form.medium} onChange={e => setForm({ ...form, medium: e.target.value })} placeholder="cpc" /></label>
        <label className="text-[10px] text-[#5f5f5d]">utm_campaign<br /><input className={cn(input, "w-32")} value={form.campaign} onChange={e => setForm({ ...form, campaign: e.target.value })} placeholder="diwali-2026" /></label>
        <label className="text-[10px] text-[#5f5f5d]">Currency<br /><input className={cn(input, "w-20")} maxLength={3} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></label>
        <button onClick={create} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50"><Plus className="w-3.5 h-3.5" /> Create</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {RANGES.map(r => (
          <button key={r.v} onClick={() => setRange(r.v)} className={cn("text-xs px-3 py-1.5 rounded-full border", range === r.v ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "border-[#eceae4] text-[#5f5f5d]")}>{r.l}</button>
        ))}
        <label className="ml-auto text-xs text-[#5f5f5d] flex items-center gap-1.5"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived</label>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<Megaphone className="w-6 h-6" />} title="No campaigns yet" desc="Create one above, then share its tracked link in your ads." />
      ) : (
        <div className="space-y-3">
          {shown.map(c => {
            const r = report[c.id];
            const first = Number(r?.requests_first || 0);
            const spent = Number(r?.spend_minor || 0);
            return (
              <div key={c.id} className={cn("card p-4", c.is_archived && "opacity-60")}>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setOpen(open === c.id ? null : c.id)} className="font-bold text-[#1c1c1c] text-left flex-1 min-w-[160px]">{c.name}</button>
                  <span className="font-mono text-[11px] text-[#5f5f5d]">{[c.utm_source, c.utm_medium, c.utm_campaign].filter(Boolean).join(" / ")}</span>
                  <button onClick={() => navigator.clipboard.writeText(trackedLink(c)).then(() => toast.success("Tracked link copied"))}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-[#eceae4] text-[#5f5f5d]"><Copy className="w-3 h-3" /> Link</button>
                  <button onClick={() => setArchived(c, !c.is_archived)} className="text-xs px-2 py-1 rounded-lg text-[#5f5f5d] hover:bg-[#f7f4ed]">{c.is_archived ? "Restore" : "Archive"}</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3 text-xs">
                  <div><div className="text-[#5f5f5d]">Spend</div><div className="font-bold tabular-nums">{formatMinor(spent, c.currency)}</div></div>
                  <div><div className="text-[#5f5f5d]">Requests (first touch)</div><div className="font-bold tabular-nums">{first}</div></div>
                  <div><div className="text-[#5f5f5d]">Requests (latest touch)</div><div className="font-bold tabular-nums">{Number(r?.requests_last || 0)}</div></div>
                  <div><div className="text-[#5f5f5d]">Provisioned</div><div className="font-bold tabular-nums">{Number(r?.provisioned_first || 0)}</div></div>
                  <div><div className="text-[#5f5f5d]">Cost per request</div><div className="font-bold tabular-nums">{first ? formatMinor(Math.round(spent / first), c.currency) : "—"}</div></div>
                </div>
                {open === c.id && <SpendPanel c={c} spend={spend.filter(s => s.campaign_id === c.id)} onChange={load} />}
              </div>
            );
          })}
          <p className="text-[11px] text-[#5f5f5d]">Requests count only visitors who allowed analytics cookies, so real numbers are higher. Revenue per campaign is not available yet: requests aren&apos;t linked to the organisations created from them.</p>
        </div>
      )}
    </div>
  );
}
