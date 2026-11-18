"use client";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { DEFAULT_POLICY, type AttendancePolicy } from "@/lib/attendance-engine";

/**
 * Org attendance rules (org_attendance_policy). Only organisation admins can
 * save - the DB enforces it too (RLS admin_write); everyone else sees them read-only.
 */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hours = (m: number) => Math.round((m / 60) * 100) / 100;

export function AttendanceRules({ policy, canEdit, onSaved }: { policy?: AttendancePolicy; canEdit: boolean; onSaved: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [p, setP] = useState<AttendancePolicy>(policy ?? DEFAULT_POLICY);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (policy) setP(policy); }, [policy]);

  const set = <K extends keyof AttendancePolicy>(k: K, v: AttendancePolicy[K]) => setP((cur) => ({ ...cur, [k]: v }));
  const toggleDay = (d: number) =>
    set("weeklyOff", p.weeklyOff.includes(d) ? p.weeklyOff.filter((x) => x !== d) : [...p.weeklyOff, d].sort());
  const num = (v: string, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number(v) || 0));

  async function save() {
    if (p.weeklyOff.length > 6) return toast.error("At least one working day is needed.");
    if (p.halfDayMinutes >= p.fullDayMinutes) return toast.error("Half-day minimum must be less than full-day hours.");
    setSaving(true);
    const { error } = await supabase.from("org_attendance_policy").upsert({
      weekly_off: p.weeklyOff,
      saturday_rule: p.saturdayRule,
      full_day_minutes: p.fullDayMinutes,
      half_day_minutes: p.halfDayMinutes,
      missed_punch: p.missedPunch,
      very_late_minutes: p.veryLateMinutes,
      lates_per_half_day: p.latesPerHalfDay,
      updated_at: new Date().toISOString(),
    }, { onConflict: "org_id" });
    setSaving(false);
    if (error) return toast.error(error.code === "42501" ? "Only organisation admins can change attendance rules." : error.message);
    toast.success("Attendance rules saved. Register updated.");
    onSaved();
  }

  const satOff = p.weeklyOff.includes(6);
  const field = "flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#6b6b67]";

  return (
    <div className="rounded-xl border border-[#ebece6] p-4 mb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold text-[#1c1c1c] uppercase tracking-wider">Attendance rules</h4>
          <p className="text-xs text-[#9a9a94] mb-3">How punches turn into Present, Late, Half Day or Absent for your organisation.</p>
        </div>
        {!canEdit && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-[#9a9a94] whitespace-nowrap"><Lock className="w-3 h-3" /> Admins only</span>
        )}
      </div>

      <fieldset disabled={!canEdit || saving} className="grid gap-3 lg:grid-cols-2 disabled:opacity-70">
        <div className="rounded-lg bg-[#f6f7f2] p-3 space-y-3">
          <div className="text-xs font-bold text-[#1c1c1c]">Working week</div>
          <div>
            <div className="text-xs text-[#6b6b67] mb-1.5">Weekly off</div>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => (
                <button key={d} type="button" onClick={() => toggleDay(i)} aria-pressed={p.weeklyOff.includes(i)}
                  className={cn("px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors",
                    p.weeklyOff.includes(i) ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "bg-white text-[#6b6b67] border-[#ebece6] hover:border-[#d4d5cd]")}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <label className={field}>Saturdays
            <select className="input h-8 text-xs sm:w-52" value={p.saturdayRule} disabled={satOff}
              onChange={(e) => set("saturdayRule", e.target.value as AttendancePolicy["saturdayRule"])}>
              <option value="full">Full working day</option>
              <option value="half">Half working day</option>
              <option value="alt_2_4_off">2nd &amp; 4th Saturday off</option>
              <option value="alt_1_3_off">1st &amp; 3rd Saturday off</option>
            </select>
          </label>
          {satOff && <p className="text-[10px] text-[#9a9a94]">Every Saturday is off (set in weekly off).</p>}
        </div>

        <div className="rounded-lg bg-[#f6f7f2] p-3 space-y-3">
          <div className="text-xs font-bold text-[#1c1c1c]">Working hours</div>
          <label className={field}>Full day (hours, first to last punch)
            <input type="number" min={1} max={16} step={0.5} className="input h-8 w-24 text-xs" value={hours(p.fullDayMinutes)}
              onChange={(e) => set("fullDayMinutes", Math.round(num(e.target.value, 1, 16) * 60))} />
          </label>
          <label className={field}>Below this many hours = Absent (0 = off)
            <input type="number" min={0} max={10} step={0.5} className="input h-8 w-24 text-xs" value={hours(p.halfDayMinutes)}
              onChange={(e) => set("halfDayMinutes", Math.round(num(e.target.value, 0, 10) * 60))} />
          </label>
          <p className="text-[10px] text-[#9a9a94]">
            Between the two = Half Day.{p.saturdayRule === "half" && !satOff ? ` Half-day Saturdays need ${hours(Math.round(p.fullDayMinutes / 2))}h.` : ""}
          </p>
        </div>

        <div className="rounded-lg bg-[#f6f7f2] p-3 space-y-3">
          <div className="text-xs font-bold text-[#1c1c1c]">Late coming</div>
          <label className={field}>Late by more than (min) = Half Day (0 = off)
            <input type="number" min={0} max={480} className="input h-8 w-24 text-xs" value={p.veryLateMinutes}
              onChange={(e) => set("veryLateMinutes", Math.round(num(e.target.value, 0, 480)))} />
          </label>
          <label className={field}>Every N lates in a month = 1 half-day cut (0 = off)
            <input type="number" min={0} max={31} className="input h-8 w-24 text-xs" value={p.latesPerHalfDay}
              onChange={(e) => set("latesPerHalfDay", Math.round(num(e.target.value, 0, 31)))} />
          </label>
          <p className="text-[10px] text-[#9a9a94]">Late is measured from shift start + grace (Shift timings above).</p>
        </div>

        <div className="rounded-lg bg-[#f6f7f2] p-3 space-y-3">
          <div className="text-xs font-bold text-[#1c1c1c]">Missed out-punch</div>
          <label className={field}>When someone punches in but not out
            <select className="input h-8 text-xs sm:w-52" value={p.missedPunch}
              onChange={(e) => set("missedPunch", e.target.value as AttendancePolicy["missedPunch"])}>
              <option value="by_in_time">Present / Late by in-time</option>
              <option value="half_day">Mark Half Day</option>
              <option value="absent">Mark Absent</option>
            </select>
          </label>
          <p className="text-[10px] text-[#9a9a94]">The day is flagged in the register either way, so HR can correct it.</p>
        </div>
      </fieldset>

      {canEdit && (
        <button type="button" className="btn-primary text-xs mt-3" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save rules"}</button>
      )}
    </div>
  );
}
