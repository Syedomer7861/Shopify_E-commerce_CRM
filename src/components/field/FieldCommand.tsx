"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Camera, Clock, ExternalLink, Loader2, MapPin, Navigation, RefreshCw, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { can } from "@/lib/access";
import { cn } from "@/lib/utils";
import {
  inRange, issues as findIssues, isMissed, matches, rangeStart, reps as repSummaries, stats as dayStats, trail,
  type FieldVisit, type Filter, type Issue, type Range,
} from "@/lib/field-command";
import type { MapPoint } from "./FieldMap";

const FieldMap = dynamic(() => import("./FieldMap").then(m => m.FieldMap), {
  ssr: false, loading: () => <div className="h-full grid place-items-center text-[#9a9a94]"><Loader2 className="w-5 h-5 animate-spin" /></div>,
});

const COLS = "id, party_name, purpose, status, planned_at, check_in_at, check_out_at, check_in_lat, check_in_lng, check_in_accuracy_m, check_in_photo_path, outcome, owner_id, created_at";
const PROOF_BUCKET = "visit-proofs";
const time = (v: string | null) => (v ? new Date(v).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—");
const dayTime = (v: string | null) => (v ? new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const mins = (a: string | null, b: string | null) => (a && b ? Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000)) : null);
const hm = (m: number | null) => (m === null ? "—" : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
const STATUS_LABEL: Record<string, string> = { planned: "Planned", checked_in: "On site", completed: "Done", cancelled: "Cancelled" };
const ISSUE_TAG: Record<Issue["kind"], string> = { missed: "Missed", long_on_site: "Overstay", no_outcome: "No outcome", weak_location: "Weak GPS" };

/**
 * Field command: who needs attention, where everyone checked in, and one
 * visit or rep in detail. Reads `visits` under the viewer's own session, so
 * a rep sees their own trail and a manager sees their team.
 */
export function FieldCommand({ compact = false, className = "mt-8" }: { compact?: boolean; className?: string }) {
  const { profile } = useCurrentProfile();
  const allowed = !!profile && can(profile, "visits", "view") !== null;
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<FieldVisit[] | null>(null);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [range, setRange] = useState<Range>("today");
  const [filter, setFilter] = useState<Filter>("all");
  const [rep, setRep] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ id: string; url: string | null } | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 31 * 86_400_000).toISOString();
    const [v, p] = await Promise.all([
      supabase.from("visits").select(COLS).or(`planned_at.gte.${since},check_in_at.gte.${since}`).order("planned_at", { ascending: false }).limit(1000),
      supabase.from("profiles").select("id,name"),
    ]);
    setRows(v.error ? [] : ((v.data || []) as unknown as FieldVisit[]));
    setPeople(Object.fromEntries((p.data || []).map((x: { id: string; name: string | null }) => [x.id, x.name || "Unnamed"])));
    setLoadedAt(new Date());
    setLoading(false);
  }, [supabase]);

  useEffect(() => { if (allowed) load(); }, [allowed, load]);
  // Refresh every 2 minutes while the tab is visible: on-site status changes during the day.
  useEffect(() => {
    if (!allowed) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 120_000);
    return () => clearInterval(id);
  }, [allowed, load]);

  const now = loadedAt?.getTime() ?? 0;
  const scoped = useMemo(() => {
    if (!rows || !loadedAt) return [];
    const start = rangeStart(range, loadedAt);
    return rows.filter(v => inRange(v, start) && (!rep || v.owner_id === rep));
  }, [rows, loadedAt, range, rep]);
  const shown = useMemo(() => scoped.filter(v => matches(v, filter, now)), [scoped, filter, now]);
  const needs = useMemo(() => findIssues(scoped, now), [scoped, now]);
  const issueIds = useMemo(() => new Set(needs.map(i => i.visit.id)), [needs]);
  const team = useMemo(() => repSummaries(scoped, now), [scoped, now]);
  const s = useMemo(() => dayStats(scoped, now), [scoped, now]);
  const counts = useMemo(() => ({
    all: scoped.length,
    on_site: scoped.filter(v => matches(v, "on_site", now)).length,
    planned: scoped.filter(v => matches(v, "planned", now)).length,
    done: scoped.filter(v => matches(v, "done", now)).length,
    missed: scoped.filter(v => matches(v, "missed", now)).length,
  }), [scoped, now]);

  const current = scoped.find(v => v.id === selected) || null;
  const trailRep = current?.owner_id || rep;
  const points: MapPoint[] = shown.filter(v => v.check_in_lat != null && v.check_in_lng != null).map(v => ({
    id: v.id, lat: Number(v.check_in_lat), lng: Number(v.check_in_lng),
    kind: issueIds.has(v.id) ? "issue" : v.status === "checked_in" ? "on_site" : v.status === "completed" ? "done" : "other",
    label: v.party_name, sub: `${people[v.owner_id || ""] || "Unassigned"} · ${time(v.check_in_at)}`,
  }));
  const line = trailRep ? trail(scoped, trailRep) : [];

  // Signed photo URL for the open visit; short-lived, fetched on demand.
  useEffect(() => {
    if (!current?.check_in_photo_path) { setPhoto(null); return; }
    let live = true;
    setPhoto({ id: current.id, url: null });
    supabase.storage.from(PROOF_BUCKET).createSignedUrl(current.check_in_photo_path, 300)
      .then(({ data }) => { if (live) setPhoto({ id: current.id, url: data?.signedUrl ?? "" }); });
    return () => { live = false; };
  }, [current?.id, current?.check_in_photo_path, supabase]);

  if (!profile || !allowed) return null;
  if (!rows) return <div className="card p-10 text-center text-[#9a9a94]"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  const chip = (on: boolean) => "px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap " +
    (on ? "bg-[#1c1c1c] text-white" : "text-[#55554f] hover:bg-[#f0f0ec]");
  const FILTERS: { key: Filter; label: string; dot?: string }[] = [
    { key: "all", label: "All" }, { key: "on_site", label: "On site", dot: "bg-[#1c1c1c]" },
    { key: "planned", label: "Planned", dot: "bg-[#c4c5bd]" }, { key: "done", label: "Done", dot: "bg-[#6b6b67]" },
    { key: "missed", label: "Missed", dot: "bg-rose-500" },
  ];

  return (
    <section aria-label="Field command" className={className}>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div>
          <h2 className="text-lg font-bold text-[#1c1c1c] leading-tight">Field command</h2>
          <p className="text-[11px] text-[#9a9a94] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3fa877]" /> Live{loadedAt && `, updated ${time(loadedAt.toISOString())}`}
            <button onClick={load} aria-label="Refresh" className="ml-1 text-[#9a9a94] hover:text-[#1c1c1c]">{loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}</button>
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Period" className="inline-flex rounded-lg border border-[#ebece6] bg-white p-0.5">
            {(["today", "7d", "30d"] as Range[]).map(r => (
              <button key={r} role="radio" aria-checked={range === r} onClick={() => setRange(r)}
                className={"px-2.5 py-1 rounded-md text-[11px] font-bold " + (range === r ? "bg-[#1c1c1c] text-white" : "text-[#6b6b67]")}>
                {r === "today" ? "Today" : r === "7d" ? "7 days" : "30 days"}
              </button>
            ))}
          </div>
          {rep && (
            <button onClick={() => setRep(null)} className="px-2.5 py-1 rounded-full bg-[#f0f0ec] text-[11px] font-bold inline-flex items-center gap-1">
              {people[rep] || "Rep"} <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className={cn("grid grid-cols-1 gap-4", compact ? "lg:grid-cols-[280px_1fr]" : "lg:grid-cols-[300px_1fr_300px]")}>
        {/* Needs you */}
        <aside className="card p-0 overflow-hidden flex flex-col lg:max-h-[640px]">
          <div className="px-4 pt-4 pb-3 border-b border-[#ebece6]">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#1c1c1c]">Needs you</h3>
              <span className={cn("px-1.5 rounded-md text-[10px] font-bold", needs.length ? "bg-rose-500 text-white" : "bg-[#f0f0ec] text-[#6b6b67]")}>{needs.length}</span>
            </div>
            <p className="text-[11px] text-[#9a9a94] mt-0.5">{s.total} visits in this period. These need a look.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {needs.length === 0 && <p className="py-8 text-center text-xs text-[#9a9a94]">All clear. Nothing needs you right now.</p>}
            {needs.map(i => (
              <button key={`${i.kind}-${i.visit.id}`} onClick={() => setSelected(i.visit.id)}
                className={cn("w-full text-left rounded-xl border p-3 transition-colors", selected === i.visit.id ? "border-[#1c1c1c] bg-[#fcfbf8]" : "border-[#ebece6] hover:border-[#c4c5bd]")}>
                <div className="flex items-center gap-2 text-[10px] text-[#9a9a94]">
                  <span className={cn("px-1.5 py-0.5 rounded font-bold uppercase tracking-wider", i.kind === "missed" || i.kind === "long_on_site" ? "bg-rose-50 text-rose-600" : "bg-[#f0f0ec] text-[#55554f]")}>{ISSUE_TAG[i.kind]}</span>
                  <span className="truncate">{people[i.visit.owner_id || ""] || "Unassigned"}</span>
                </div>
                <div className="mt-1.5 text-xs font-semibold text-[#1c1c1c]">{i.title}</div>
                <div className="text-[11px] text-[#6b6b67]">{i.detail}</div>
              </button>
            ))}
          </div>
        </aside>

        {/* Map */}
        <div className="card p-0 overflow-hidden relative min-h-[420px] lg:min-h-[640px] isolate">
          <div className="absolute z-[500] top-3 left-3 right-3 flex flex-wrap gap-1 rounded-full bg-white/95 border border-[#ebece6] p-1 w-fit max-w-[calc(100%-1.5rem)] overflow-x-auto shadow-sm">
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key} className={chip(filter === f.key)}>
                {f.dot && <span className={cn("w-1.5 h-1.5 rounded-full", filter === f.key ? "bg-white" : f.dot)} />}
                {f.label} <span className="opacity-60 tabular-nums">{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <FieldMap points={points} trailLine={line} selectedId={selected} onSelect={setSelected} className="absolute inset-0" />
          {points.length === 0 && (
            <div className="absolute z-[500] inset-x-0 bottom-20 mx-auto w-fit rounded-xl bg-white/95 border border-[#ebece6] px-4 py-2 text-xs text-[#6b6b67] shadow-sm">
              No check-in locations for this filter yet.
            </div>
          )}
          <div className="absolute z-[500] bottom-3 left-3 right-14 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Tile label="On site now" value={s.onSite} sub={`of ${s.total}`} />
            <Tile label="Completion" value={s.completion === null ? "—" : `${s.completion}%`} sub={`${s.done} done`} />
            <Tile label="Missed" value={s.missed} sub="12h+ late" warn={s.missed > 0} />
            <Tile label="Avg time on site" value={hm(s.avgStayMin)} sub={s.proof === null ? "no check-ins" : `${s.proof}% with GPS`} />
          </div>
        </div>

        {/* Detail */}
        {!compact && (
          <aside className="card p-0 overflow-hidden flex flex-col lg:max-h-[640px]">
            {current ? (
              <VisitDetail v={current} rep={people[current.owner_id || ""]} photo={photo?.id === current.id ? photo.url : undefined}
                issue={needs.find(i => i.visit.id === current.id)} now={now}
                onRep={() => { setRep(current.owner_id); setSelected(null); }} onClose={() => setSelected(null)} />
            ) : (
              <>
                <div className="px-4 pt-4 pb-3 border-b border-[#ebece6] flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#6b6b67]" /><h3 className="text-sm font-bold text-[#1c1c1c]">Team in the field</h3>
                  <span className="ml-auto text-[10px] text-[#9a9a94]">{team.length} reps</span>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-[#f0f0ec]">
                  {team.length === 0 && <p className="py-8 text-center text-xs text-[#9a9a94]">No visits in this period.</p>}
                  {team.map(r => (
                    <button key={r.id} onClick={() => setRep(rep === r.id ? null : r.id)}
                      className={cn("w-full text-left px-4 py-3 hover:bg-[#fcfbf8]", rep === r.id && "bg-[#f6f7f2]")}>
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-full bg-[#1c1c1c] text-white text-[11px] font-bold grid place-items-center shrink-0">{(people[r.id] || "?").slice(0, 1).toUpperCase()}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-[#1c1c1c] truncate">{people[r.id] || "Unassigned"}</div>
                          <div className="text-[10px] text-[#9a9a94] truncate">{r.last ? `Last: ${r.last.party_name}, ${time(r.last.check_in_at)}` : "No check-in yet"}</div>
                        </div>
                        {r.onSite > 0 && <span className="px-1.5 py-0.5 rounded bg-[#1c1c1c] text-white text-[9px] font-bold uppercase">On site</span>}
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-[#6b6b67] tabular-nums">
                        <span><b className="text-[#1c1c1c]">{r.visits}</b> visits</span>
                        <span><b className="text-[#1c1c1c]">{r.done}</b> done</span>
                        <span className={r.missed ? "text-rose-600" : ""}><b>{r.missed}</b> missed</span>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="px-4 py-2.5 border-t border-[#ebece6] text-[10px] text-[#9a9a94]">Pick a rep to see their route; pick a pin or card for the visit.</p>
              </>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}

function Tile({ label, value, sub, warn }: { label: string; value: string | number; sub: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-white/95 border border-[#ebece6] px-3 py-2 shadow-sm">
      <div className="text-[10px] text-[#9a9a94]">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums leading-tight", warn ? "text-rose-600" : "text-[#1c1c1c]")}>{value}</div>
      <div className="text-[10px] text-[#9a9a94] truncate">{sub}</div>
    </div>
  );
}

function VisitDetail({ v, rep, photo, issue, now, onRep, onClose }: {
  v: FieldVisit; rep?: string; photo: string | null | undefined; issue?: Issue; now: number; onRep: () => void; onClose: () => void;
}) {
  const stay = v.status === "checked_in" ? mins(v.check_in_at, new Date(now).toISOString()) : mins(v.check_in_at, v.check_out_at);
  const late = mins(v.planned_at, v.check_in_at);
  const status = isMissed(v, now) ? "Missed" : STATUS_LABEL[v.status] || v.status;
  const hasLoc = v.check_in_lat != null && v.check_in_lng != null;
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-[#ebece6]">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-[#1c1c1c] break-words">{v.party_name}</h3>
            <p className="text-[11px] text-[#9a9a94]">{v.purpose || "Visit"}</p>
          </div>
          <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", status === "Missed" ? "bg-rose-50 text-rose-600" : "bg-[#f0f0ec] text-[#1c1c1c]")}>{status}</span>
          <button onClick={onClose} aria-label="Close visit" className="text-[#9a9a94] hover:text-[#1c1c1c]"><X className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="rounded-xl overflow-hidden border border-[#ebece6] bg-[#f6f7f2] aspect-[4/3] grid place-items-center">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
            <a href={photo} target="_blank" rel="noopener noreferrer" className="block w-full h-full"><img src={photo} alt={`Check-in photo at ${v.party_name}`} className="w-full h-full object-cover" /></a>
          ) : photo === null ? <Loader2 className="w-5 h-5 animate-spin text-[#9a9a94]" />
            : <span className="text-[11px] text-[#9a9a94] flex flex-col items-center gap-1"><Camera className="w-5 h-5" />No photo</span>}
        </div>
        <button onClick={onRep} className="w-full flex items-center gap-2 rounded-xl border border-[#ebece6] p-2.5 hover:border-[#c4c5bd] text-left">
          <span className="w-8 h-8 rounded-full bg-[#1c1c1c] text-white text-xs font-bold grid place-items-center">{(rep || "?").slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0"><span className="block text-xs font-semibold text-[#1c1c1c] truncate">{rep || "Unassigned"}</span><span className="block text-[10px] text-[#9a9a94]">Show this rep&apos;s route</span></span>
        </button>
        <div className="grid grid-cols-2 gap-2">
          <Fact icon={<Clock className="w-3 h-3" />} label="Planned" value={dayTime(v.planned_at)} />
          <Fact icon={<MapPin className="w-3 h-3" />} label="Checked in" value={time(v.check_in_at)} sub={late !== null && late > 15 ? `${hm(late)} after plan` : undefined} />
          <Fact icon={<Clock className="w-3 h-3" />} label={v.status === "checked_in" ? "On site for" : "Time on site"} value={hm(stay)} />
          <Fact icon={<Navigation className="w-3 h-3" />} label="GPS accuracy" value={v.check_in_accuracy_m != null ? `±${Math.round(v.check_in_accuracy_m)}m` : hasLoc ? "Recorded" : "—"} />
        </div>
        {issue && (
          <div className="rounded-xl bg-rose-50 border border-rose-100 p-3 text-[11px] text-rose-700 flex gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{issue.detail}</span>
          </div>
        )}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#9a9a94] mb-1">Outcome</div>
          <p className="text-xs text-[#1c1c1c] whitespace-pre-line">{v.outcome?.trim() || "Not logged yet."}</p>
        </div>
      </div>
      {hasLoc && (
        <div className="p-3 border-t border-[#ebece6] grid grid-cols-2 gap-2">
          <a href={`https://www.google.com/maps?q=${v.check_in_lat},${v.check_in_lng}`} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs inline-flex items-center justify-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> Google Maps</a>
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${v.check_in_lat},${v.check_in_lng}`} target="_blank" rel="noopener noreferrer" className="btn-primary text-xs inline-flex items-center justify-center gap-1.5"><Navigation className="w-3.5 h-3.5" /> Directions</a>
        </div>
      )}
    </div>
  );
}

function Fact({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#ebece6] p-2.5">
      <div className="flex items-center gap-1 text-[10px] text-[#9a9a94]">{icon}{label}</div>
      <div className="text-sm font-bold text-[#1c1c1c] tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-amber-600">{sub}</div>}
    </div>
  );
}
