"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Loader2, Building2, User, Mail, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase";

type Overview = {
  orgs_total: number; orgs_active: number; orgs_suspended: number; orgs_new_30d: number;
  users_total: number; users_enabled: number; users_new_30d: number;
  active_1d: number; active_7d: number; active_30d: number;
  requests_new: number; requests_total: number; storage_bytes: number; generated_at: string;
};
type Hit = { kind: "organisation" | "user" | "request"; id: string; title: string; subtitle: string };

const mb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`);

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d]">{label}</div>
      <div className="text-2xl font-bold text-[#1c1c1c] mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-[#5f5f5d] mt-1">{sub}</div>}
    </div>
  );
}

const HIT_ICON = { organisation: Building2, user: User, request: Mail } as const;
const hitHref = (h: Hit) =>
  h.kind === "organisation" ? `/superadmin/organisations?focus=${h.id}` : h.kind === "request" ? "/superadmin/requests" : null;

export default function SuperAdminOverview() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setError("");
    const { data: row, error: err } = await supabase.rpc("platform_overview");
    if (err) setError(err.message);
    else setData(row as Overview | null);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data: rows } = await supabase.rpc("platform_search", { q: term });
      setHits((rows || []) as Hit[]);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, supabase]);

  return (
    <div>
      <PageHeader
        title="Super Admin"
        subtitle="Live numbers across every organisation on CodeCrest."
        actions={<button onClick={load} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-[#eceae4]"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>}
      />

      <div className="relative mb-6">
        <Search className="w-4 h-4 text-[#5f5f5d] absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search organisations, users, requests..."
          className="w-full h-11 pl-9 pr-9 bg-white border border-[#eceae4] rounded-xl text-sm focus:outline-none focus:border-[#1c1c1c]/30" />
        {searching && <Loader2 className="w-4 h-4 animate-spin text-[#5f5f5d] absolute right-3 top-1/2 -translate-y-1/2" />}
        {q.trim().length >= 2 && !searching && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-[#eceae4] rounded-xl shadow-xl max-h-80 overflow-y-auto">
            {hits.length === 0 ? <div className="p-4 text-xs text-[#5f5f5d]">Nothing matched.</div> : hits.map(h => {
              const Icon = HIT_ICON[h.kind];
              const href = hitHref(h);
              const body = (
                <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f7f4ed]">
                  <Icon className="w-3.5 h-3.5 text-[#5f5f5d] shrink-0" />
                  <span className="text-sm font-semibold text-[#1c1c1c] truncate">{h.title}</span>
                  <span className="text-[11px] text-[#5f5f5d] truncate">{h.subtitle}</span>
                </div>
              );
              return href ? <Link key={h.kind + h.id} href={href}>{body}</Link> : <div key={h.kind + h.id}>{body}</div>;
            })}
          </div>
        )}
      </div>

      {error ? (
        <div className="card p-4 text-sm text-red-600">Couldn&apos;t load numbers: {error}</div>
      ) : !data ? (
        <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : (
        <>
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-3">Organisations</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Tile label="Total" value={data.orgs_total} />
            <Tile label="Active" value={data.orgs_active} />
            <Tile label="Suspended" value={data.orgs_suspended} />
            <Tile label="New, last 30 days" value={data.orgs_new_30d} />
          </div>

          <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-3">Users</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Tile label="Total accounts" value={data.users_total} sub={`${data.users_enabled} enabled`} />
            <Tile label="Active today" value={data.active_1d} sub="Had the app open in the last 24 hours" />
            <Tile label="Active, 7 days" value={data.active_7d} />
            <Tile label="Active, 30 days" value={data.active_30d} sub={`${data.users_new_30d} new accounts in 30 days`} />
          </div>

          <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-3">Pipeline and platform</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Tile label="New requests" value={data.requests_new} sub={`${data.requests_total} received in total`} />
            <Tile label="File storage" value={mb(data.storage_bytes)} sub="All organisations" />
          </div>

          <div className="card p-4 text-xs text-[#5f5f5d]">
            <span className="font-semibold text-[#1c1c1c]">Not available yet:</span> revenue (MRR, ARR), churn, trial conversion, customer acquisition cost and lifetime value.
            They need subscription billing (Razorpay) and campaign tracking, which come in later phases, and will be calculated from real records, never estimated.
            <div className="mt-2 text-[10px]">Updated {new Date(data.generated_at).toLocaleString()}.</div>
          </div>
        </>
      )}
    </div>
  );
}
