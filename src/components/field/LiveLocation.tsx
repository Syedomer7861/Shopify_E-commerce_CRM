"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Radio } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { distanceM } from "@/lib/field-command";
import { cn } from "@/lib/utils";

/**
 * Live location sharing for field staff. Opt-in per person, per device: the
 * switch is remembered in this browser only, and it stops by itself after
 * MAX_HOURS. Only the latest position is kept (one row per person), so it
 * never grows. Works while the app is open; a web page can't track a phone
 * in the background.
 */
const KEY = "field-live-share";
const EVENT = "field-live-share-change";
const MAX_HOURS = 10;
const SEND_EVERY_MS = 60_000;
const SEND_IF_MOVED_M = 75;

function read(): number | null {
  try { const v = Number(localStorage.getItem(KEY)); return v > 0 ? v : null; } catch { return null; }
}
function write(v: number | null) {
  try { if (v) localStorage.setItem(KEY, String(v)); else localStorage.removeItem(KEY); } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVENT));
}
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
};

// Module-level so they keep one identity across renders (the agent's effect depends on stop).
const startShare = () => write(Date.now());
const stopShare = () => write(null);

/** When this device started sharing (ms), or null. */
export function useLiveShare() {
  const since = useSyncExternalStore(subscribe, read, () => null);
  return { since, start: startShare, stop: stopShare };
}

async function markStopped(userId: string) {
  await createClient().from("field_live_locations").update({ sharing: false, updated_at: new Date().toISOString() }).eq("user_id", userId);
}

/** Mounted once in the app layout; sends positions while sharing is on. Renders nothing. */
export function LiveLocationAgent() {
  const { profile } = useCurrentProfile();
  const { since, stop } = useLiveShare();
  const last = useRef<{ at: number; pos: [number, number] } | null>(null);

  useEffect(() => {
    if (!since || !profile?.id || typeof navigator === "undefined" || !navigator.geolocation) return;
    const userId = profile.id;
    if (Date.now() - since > MAX_HOURS * 3_600_000) { stop(); markStopped(userId); return; }
    const supabase = createClient();
    let first = !last.current;
    let dead = false;

    const send = async (lat: number, lng: number, acc: number) => {
      const row: Record<string, unknown> = { user_id: userId, lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), accuracy_m: Number(Math.min(acc, 99999).toFixed(1)), sharing: true, updated_at: new Date().toISOString() };
      if (first) row.started_at = new Date(since).toISOString();
      const { error } = await supabase.from("field_live_locations").upsert(row, { onConflict: "user_id" });
      if (error) {
        // Table not there yet (migration pending): stop quietly instead of retrying every minute.
        if (/field_live_locations|relation|schema cache/i.test(error.message)) { dead = true; stop(); }
        return;
      }
      first = false;
    };

    const watch = navigator.geolocation.watchPosition(p => {
      if (dead) return;
      const pos: [number, number] = [p.coords.latitude, p.coords.longitude];
      const prev = last.current;
      const due = !prev || Date.now() - prev.at >= SEND_EVERY_MS || distanceM(prev.pos, pos) >= SEND_IF_MOVED_M;
      if (!due) return;
      last.current = { at: Date.now(), pos };
      send(pos[0], pos[1], p.coords.accuracy);
    }, err => {
      if (err.code === err.PERMISSION_DENIED) {
        toast.error("Location permission is off, so live sharing stopped. Allow location for this site to share.");
        stop(); markStopped(userId);
      }
    }, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 30_000 });

    const timer = setTimeout(() => { stop(); markStopped(userId); toast("Live location sharing stopped after 10 hours."); }, Math.max(0, since + MAX_HOURS * 3_600_000 - Date.now()));
    return () => { navigator.geolocation.clearWatch(watch); clearTimeout(timer); };
  }, [since, profile?.id, stop]);

  return null;
}

/** The on/off switch shown on the field page. */
export function LiveShareToggle({ className }: { className?: string }) {
  const { profile } = useCurrentProfile();
  const { since, start, stop } = useLiveShare();
  const on = !!since;
  const toggle = () => {
    if (on) {
      stop();
      if (profile?.id) markStopped(profile.id);
      toast.success("Stopped sharing your location");
      return;
    }
    if (!navigator.geolocation) return void toast.error("This device can't share location.");
    start();
    toast.success("Sharing your live location with your manager while the app is open. Stops by itself after 10 hours.", { duration: 6000 });
  };
  return (
    <button type="button" onClick={toggle} aria-pressed={on}
      title={on ? `Sharing since ${new Date(since!).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "Let your manager see where you are while you work"}
      className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold border transition-colors",
        on ? "bg-[var(--accent)] border-[var(--accent)] text-[#1c1c1c]" : "bg-white border-[#ebece6] text-[#55554f] hover:border-[#1c1c1c]", className)}>
      <span className={cn("relative flex w-2 h-2", on && "after:absolute after:inset-0 after:rounded-full after:bg-[#1c1c1c] after:animate-ping motion-reduce:after:hidden")}>
        <span className={cn("w-2 h-2 rounded-full", on ? "bg-[#1c1c1c]" : "bg-[#c4c5bd]")} />
      </span>
      <Radio className="w-3.5 h-3.5" /> {on ? "Sharing live location" : "Share my live location"}
    </button>
  );
}
