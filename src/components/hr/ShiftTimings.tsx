"use client";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase";
import { SHIFT_START_MINUTES, LATE_GRACE_MINUTES } from "@/lib/attendance-engine";

const SHIFTS = ["Morning", "Afternoon", "Night"] as const;
type Row = { start: number; grace: number };

const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromHHMM = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
export const shiftLabel = (m: number) =>
  new Date(Date.UTC(2000, 0, 1, Math.floor(m / 60), m % 60)).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

/**
 * Shift start time + grace per shift type (org_shift_timings). "Late" in the
 * register is measured against these; unset shifts use the built-in defaults.
 */
export function ShiftTimings({ onLoaded, canEdit = true, onSaved }: { onLoaded?: (startByShift: Record<string, number>) => void; canEdit?: boolean; onSaved?: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const defaults = Object.fromEntries(SHIFTS.map(s => [s, { start: SHIFT_START_MINUTES[s], grace: LATE_GRACE_MINUTES }])) as Record<string, Row>;
  const [rows, setRows] = useState<Record<string, Row>>(defaults);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("org_shift_timings").select("shift_type, start_minute, grace_minutes").then(({ data, error }) => {
      if (error) return; // table not there yet: defaults stay
      const next = { ...defaults };
      for (const r of data || []) next[r.shift_type] = { start: r.start_minute, grace: r.grace_minutes };
      setRows(next);
      onLoaded?.(Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v.start])));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("org_shift_timings").upsert(
      SHIFTS.map(s => ({ shift_type: s, start_minute: rows[s].start, grace_minutes: rows[s].grace, updated_at: new Date().toISOString() })),
      { onConflict: "org_id,shift_type" });
    setSaving(false);
    if (error) return toast.error(error.code === "42501" ? "Only organisation admins can change shift timings." : error.message);
    onLoaded?.(Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.start])));
    toast.success("Shift timings saved. Register updated.");
    onSaved?.();
  }

  return (
    <div className="rounded-xl border border-[#ebece6] p-4 mb-6">
      <h4 className="text-xs font-bold text-[#1c1c1c] uppercase tracking-wider">Shift timings</h4>
      <p className="text-xs text-[#9a9a94] mb-3">A clock-in after start + grace is marked Late (biometric and CRM log alike).</p>
      <fieldset disabled={!canEdit || saving} className="grid gap-3 sm:grid-cols-3 disabled:opacity-70">
        {SHIFTS.map(s => (
          <div key={s} className="rounded-lg bg-[#f6f7f2] p-3 space-y-2">
            <div className="text-xs font-bold text-[#1c1c1c]">{s}</div>
            <label className="flex items-center justify-between gap-2 text-xs text-[#6b6b67]">Starts
              <input type="time" className="input h-8 w-28 text-xs" value={toHHMM(rows[s].start)}
                onChange={e => e.target.value && setRows(r => ({ ...r, [s]: { ...r[s], start: fromHHMM(e.target.value) } }))} />
            </label>
            <label className="flex items-center justify-between gap-2 text-xs text-[#6b6b67]">Grace (min)
              <input type="number" min={0} max={180} className="input h-8 w-28 text-xs" value={rows[s].grace}
                onChange={e => setRows(r => ({ ...r, [s]: { ...r[s], grace: Math.min(180, Math.max(0, Number(e.target.value) || 0)) } }))} />
            </label>
          </div>
        ))}
      </fieldset>
      {canEdit
        ? <button type="button" className="btn-primary text-xs mt-3" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save timings"}</button>
        : <p className="text-[10px] font-bold text-[#9a9a94] mt-3">Only organisation admins can change shift timings.</p>}
    </div>
  );
}
