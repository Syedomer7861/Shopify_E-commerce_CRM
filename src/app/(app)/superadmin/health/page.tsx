"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Health = {
  generated_at: string;
  db: { db_bytes: number; tables: { name: string; bytes: number }[] } | null;
  snapshots: { at: string; db_bytes: number; note: string | null }[];
  integrations: { source: string; last_24h: number; last_at: string; failed_7d: number }[];
  failures: { source: string; topic: string; status: string | null; error: string | null; at: string }[];
};

const MB = 1024 * 1024;
// Supabase Free-plan database ceiling; same figure the egress-watch job warns against.
const DB_LIMIT = 500 * MB;
const mb = (b: number) => `${(b / MB).toFixed(1)} MB`;
const hoursAgo = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000;
const ago = (iso: string) => {
  const h = hoursAgo(iso);
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;
};

function Tile({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={cn("card p-4", warn && "ring-1 ring-amber-300")}>
      <div className="text-[11px] text-[#5f5f5d]">{label}</div>
      <div className={cn("text-xl font-bold tabular-nums mt-1", warn ? "text-amber-700" : "text-[#1c1c1c]")}>{value}</div>
      {sub && <div className="text-[11px] text-[#5f5f5d] mt-1">{sub}</div>}
    </div>
  );
}

export default function SuperAdminHealth() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("platform_health_overview");
    setBusy(false);
    if (error) return toast.error(error.message);
    setData(data as Health);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  const dbBytes = Number(data.db?.db_bytes || 0);
  const used = dbBytes / DB_LIMIT;
  const last = data.snapshots[data.snapshots.length - 1];
  const jobsLate = !last || hoursAgo(last.at) > 26;
  const maxSnap = Math.max(1, ...data.snapshots.map(s => Number(s.db_bytes)));
  const warnings = data.snapshots.filter(s => s.note && hoursAgo(s.at) < 24 * 7).reverse();
  const failed = data.integrations.reduce((n, i) => n + Number(i.failed_7d), 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Health" subtitle="Database size, scheduled jobs and integration traffic. Read-only." />
      <div className="flex items-center gap-2 text-[11px] text-[#5f5f5d]">
        Checked {new Date(data.generated_at).toLocaleString()}
        <button onClick={load} disabled={busy} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#eceae4] disabled:opacity-50">
          <RefreshCw className={cn("w-3 h-3", busy && "animate-spin")} /> Run again
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Database size" value={mb(dbBytes)} warn={used >= 0.8} sub={`${(used * 100).toFixed(0)}% of the ${mb(DB_LIMIT)} plan limit`} />
        <Tile label="Daily jobs last ran" value={last ? ago(last.at) : "Never"} warn={jobsLate}
          sub={jobsLate ? "Over a day ago: check the scheduled jobs workflow on GitHub" : "From the daily size snapshot"} />
        <Tile label="Integration events, 24 h" value={String(data.integrations.reduce((n, i) => n + Number(i.last_24h), 0))}
          sub={data.integrations.map(i => `${i.source} ${i.last_24h}`).join(" · ") || "None in 7 days"} />
        <Tile label="Failed events, 7 days" value={String(failed)} warn={failed > 0} sub="Webhooks and syncs not processed" />
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <div className="card p-4 lg:col-span-2">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-3">Database size, daily</div>
          {data.snapshots.length === 0 ? <p className="text-xs text-[#5f5f5d]">No snapshots yet.</p> : (
            <>
              <div className="flex items-end gap-1 h-28" role="img" aria-label="Database size over the last 30 snapshots">
                {data.snapshots.map(s => (
                  <div key={s.at} className="flex-1 h-full flex items-end" title={`${new Date(s.at).toLocaleDateString()}: ${mb(Number(s.db_bytes))}`}>
                    <div className={cn("w-full rounded-t", s.note ? "bg-amber-500" : "bg-[#1c1c1c]")} style={{ height: `${(Number(s.db_bytes) / maxSnap) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-[#5f5f5d] mt-1">
                <span>{new Date(data.snapshots[0].at).toLocaleDateString()}</span><span>{new Date(last!.at).toLocaleDateString()}</span>
              </div>
            </>
          )}
          {warnings.map(w => <p key={w.at} className="text-xs text-amber-700 mt-2">{new Date(w.at).toLocaleDateString()}: {w.note}</p>)}
        </div>
        <div className="card p-4">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-2">Largest tables</div>
          {(data.db?.tables || []).slice(0, 10).map(t => (
            <div key={t.name} className="flex justify-between text-xs py-0.5"><span className="font-mono truncate">{t.name}</span><span className="tabular-nums">{mb(Number(t.bytes))}</span></div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-2">Integrations, 7 days</div>
          {data.integrations.length === 0 ? <p className="text-xs text-[#5f5f5d]">No events.</p> : data.integrations.map(i => (
            <div key={i.source} className="flex justify-between text-xs py-0.5">
              <span className="capitalize">{i.source}</span><span className="text-[#5f5f5d]">last {ago(i.last_at)}{Number(i.failed_7d) ? ` · ${i.failed_7d} failed` : ""}</span>
            </div>
          ))}
        </div>
        <div className="card p-4 lg:col-span-2">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-2">Recent failures</div>
          {data.failures.length === 0 ? <p className="text-xs text-[#5f5f5d]">None in 7 days.</p> : data.failures.map((f, i) => (
            <div key={i} className="text-xs py-1 border-b border-[#eceae4] last:border-0">
              <span className="font-semibold">{f.source} · {f.topic}</span> <span className="text-[#5f5f5d]">{ago(f.at)}</span>
              {f.error && <div className="text-red-700 break-words">{f.error}</div>}
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-[#5f5f5d]">Data transfer (egress) isn&apos;t visible to the database; size growth is the closest signal. Jobs on GitHub Actions don&apos;t report each run here.</p>
    </div>
  );
}
