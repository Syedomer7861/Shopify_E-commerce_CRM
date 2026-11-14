"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase";

type Seats = { limit: number | null; used: number; override: number | null };

/** Seats in use for one workspace, and the owner's per-workspace seat override. */
export function SeatOverridePanel({ orgId }: { orgId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [seats, setSeats] = useState<Seats | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("platform_org_seats", { p_org: orgId });
    if (error) return toast.error(error.message);
    const s = data as Seats;
    setSeats(s);
    setValue(s.override == null ? "" : String(s.override));
  }, [supabase, orgId]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    const n = value.trim() === "" ? null : Number(value);
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 100000)) return toast.error("Seats must be a whole number from 1, or empty to follow the plan");
    setBusy(true);
    const { error } = await supabase.rpc("platform_set_org_seat_override", { p_org: orgId, p_max_users: n });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(n == null ? "Seats follow the plan" : `Seats set to ${n}`);
    load();
  }

  if (!seats) return null;
  return (
    <div className="col-span-2 border-t border-[#eceae4] pt-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-2">Team members</div>
      <p className="text-sm tabular-nums">{seats.used} of {seats.limit ?? "unlimited"} in use</p>
      <div className="flex gap-1 mt-2">
        <input value={value} onChange={e => setValue(e.target.value)} inputMode="numeric" placeholder="Follow plan"
          className="h-9 w-28 px-3 bg-white border border-[#eceae4] rounded-lg text-sm focus:outline-none focus:border-[#1c1c1c]/30" />
        <button onClick={save} disabled={busy} className="inline-flex items-center gap-1 text-xs font-semibold px-3 rounded-lg border border-[#eceae4] disabled:opacity-50">
          {busy && <Loader2 className="w-3 h-3 animate-spin" />} Set seats
        </button>
      </div>
      <p className="text-[10px] text-[#5f5f5d] mt-1">Override for custom deals or extra seats. Empty = use the plan limit.</p>
    </div>
  );
}
