"use client";
import toast from "react-hot-toast";
import { ModulePage } from "@/components/records/ModulePage";
import type { RecordsConfig, RecordRow } from "@/components/records/RecordsModule";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";

const when = (v: string | null) => (v ? new Date(v).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

function currentPosition(): Promise<GeolocationPosition | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 10000 });
  });
}

export default function FieldVisitsPage() {
  const { profile } = useCurrentProfile();

  // Location is opt-in per check-in: declining still records the check-in, just without coordinates.
  async function checkIn(row: RecordRow, reload: () => void) {
    const share = confirm("Share your current location with this check-in?\n\nOK = attach location. Cancel = check in without it.");
    const position = share ? await currentPosition() : null;
    if (share && !position) toast("Couldn't read your location - checking in without it.");
    const { error } = await createClient().from("visits").update({
      status: "checked_in",
      check_in_at: new Date().toISOString(),
      location_consent: !!position,
      check_in_lat: position ? Number(position.coords.latitude.toFixed(6)) : null,
      check_in_lng: position ? Number(position.coords.longitude.toFixed(6)) : null,
    }).eq("id", row.id);
    if (error) toast.error(error.message);
    else { toast.success("Checked in"); reload(); }
  }

  async function complete(row: RecordRow, reload: () => void) {
    const outcome = prompt("Outcome of the visit?");
    if (outcome === null) return;
    const { error } = await createClient().from("visits")
      .update({ status: "completed", check_out_at: new Date().toISOString(), outcome: outcome.trim() || null }).eq("id", row.id);
    if (error) toast.error(error.message);
    else reload();
  }

  const visits: RecordsConfig = {
    table: "visits", module: "visits", noun: "visit", ownerCol: "owner_id", ownerLabel: "Rep",
    columns: [
      { key: "party_name", label: "Visiting" },
      { key: "purpose", label: "Purpose" },
      { key: "planned_at", label: "Planned", format: when },
      { key: "check_in_at", label: "Checked in", format: (v, row) => v ? <>{when(v)}{row.location_consent && <span className="ml-1 text-[9px] font-bold text-emerald-600">GPS</span>}</> : "—" },
      { key: "outcome", label: "Outcome" },
    ],
    fields: [
      { key: "party_name", label: "Who are you visiting?", required: true },
      { key: "purpose", label: "Purpose" },
      { key: "planned_at", label: "Planned for", type: "datetime-local" },
    ],
    rowActions: (row, reload) => {
      if (row.owner_id !== profile?.id) return null;
      if (row.status === "planned") return <button onClick={() => checkIn(row, reload)} className="text-[10px] font-bold underline text-[#1c1c1c]">Check in</button>;
      if (row.status === "checked_in") return <button onClick={() => complete(row, reload)} className="text-[10px] font-bold underline text-[#1c1c1c]">Complete</button>;
      return null;
    },
  };

  return (
    <ModulePage
      title="Field Visits"
      subtitle="Plan visits, check in on site, log the outcome. Location is attached only when the rep agrees at check-in."
      tabs={[{ label: "Visits", config: visits }]}
    />
  );
}
