"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { ModulePage } from "@/components/records/ModulePage";
import { FieldOverview } from "@/components/records/DeptOverviews";
import type { RecordsConfig, RecordRow } from "@/components/records/RecordsModule";
import { CheckInCapture, type CheckInProof } from "@/components/field/CheckInCapture";
import { Modal } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";

const PROOF_BUCKET = "visit-proofs";
const when = (v: string | null) => (v ? new Date(v).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

export default function FieldVisitsPage() {
  const { profile } = useCurrentProfile();
  const [checkingIn, setCheckingIn] = useState<{ row: RecordRow; reload: () => void } | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);

  // Photo and location arrive together from CheckInCapture; a check-in without both never reaches here.
  async function saveCheckIn(proof: CheckInProof) {
    if (!checkingIn || !profile) return;
    const { row, reload } = checkingIn;
    const supabase = createClient();
    const path = `${profile.org_id}/${profile.id}/${row.id}-${proof.takenAt.getTime()}.jpg`;
    const upload = await supabase.storage.from(PROOF_BUCKET).upload(path, proof.photo, { contentType: "image/jpeg" });
    // Only a database that hasn't had migration 20261112a yet may check in without the photo.
    if (upload.error && !/bucket not found/i.test(upload.error.message)) {
      throw new Error("Couldn't upload the photo. Check your connection and try again.");
    }

    const { error } = await supabase.from("visits").update({
      status: "checked_in",
      check_in_at: proof.takenAt.toISOString(),
      location_consent: true,
      check_in_lat: Number(proof.lat.toFixed(6)),
      check_in_lng: Number(proof.lng.toFixed(6)),
      // Photo columns arrive with migration 20261112a; until then the check-in still saves with location.
      ...(upload.error ? {} : { check_in_photo_path: path, check_in_accuracy_m: Number(proof.accuracyM.toFixed(1)) }),
    }).eq("id", row.id);
    if (error) throw new Error(error.message);

    if (upload.error) toast("Checked in with location. The photo wasn't saved: photo storage isn't set up yet (ask your admin).", { duration: 7000 });
    else toast.success("Checked in with photo and location");
    setCheckingIn(null);
    reload();
  }

  async function viewProof(path: string) {
    const { data, error } = await createClient().storage.from(PROOF_BUCKET).createSignedUrl(path, 120);
    if (error || !data) toast.error("Couldn't open the photo");
    else setProofUrl(data.signedUrl);
  }

  async function complete(row: RecordRow, reload: () => void) {
    const outcome = prompt("Outcome of the visit?");
    if (outcome === null) return;
    const { error } = await createClient().from("visits")
      .update({ status: "completed", check_out_at: new Date().toISOString(), outcome: outcome.trim() || null }).eq("id", row.id);
    if (error) toast.error(error.message);
    else reload();
  }

  const link = "text-[10px] font-bold underline text-[#1c1c1c]";
  const action = "px-2.5 py-1.5 rounded-lg bg-[#1c1c1c] text-white text-[10px] font-bold";
  const visits: RecordsConfig = {
    table: "visits", module: "visits", noun: "visit", ownerCol: "owner_id", ownerLabel: "Rep",
    columns: [
      { key: "party_name", label: "Visiting" },
      { key: "purpose", label: "Purpose" },
      { key: "planned_at", label: "Planned", format: when },
      { key: "check_in_at", label: "Checked in", format: when },
      {
        key: "check_in_lat", label: "Proof", format: (lat, row) => lat == null && !row.check_in_photo_path ? "—" : (
          <span className="flex gap-2 whitespace-nowrap">
            {lat != null && (
              <a href={`https://www.google.com/maps?q=${lat},${row.check_in_lng}`} target="_blank" rel="noopener noreferrer" className={link}>
                Map{row.check_in_accuracy_m != null && ` ±${Math.round(row.check_in_accuracy_m)}m`}
              </a>
            )}
            {row.check_in_photo_path && <button onClick={() => viewProof(row.check_in_photo_path)} className={link}>Photo</button>}
          </span>
        ),
      },
      { key: "outcome", label: "Outcome" },
    ],
    fields: [
      { key: "party_name", label: "Who are you visiting?", required: true },
      { key: "purpose", label: "Purpose" },
      { key: "planned_at", label: "Planned for", type: "datetime-local" },
    ],
    samples: [
      { party_name: "Sharma Medical Store", purpose: "Monthly stock review", planned_at: hoursFromNow(-26), check_in_at: hoursFromNow(-26), outcome: "Reorder placed for next week", status: "completed" },
      { party_name: "GreenLeaf Wellness Clinic", purpose: "Product demo", planned_at: hoursFromNow(-2), check_in_at: hoursFromNow(-2), status: "checked_in" },
      { party_name: "Apex Distributors", purpose: "Payment follow-up", planned_at: hoursFromNow(22), status: "planned" },
    ],
    // On site already: save the visit and go straight to the camera.
    createAndAct: { label: "Save & check in now (photo + location)", run: (row, reload) => setCheckingIn({ row, reload }) },
    rowActions: (row, reload) => {
      if (row.owner_id !== profile?.id) return null;
      if (row.status === "planned") return <button onClick={() => setCheckingIn({ row, reload })} className={action}>Check in</button>;
      if (row.status === "checked_in") return <button onClick={() => complete(row, reload)} className={action}>Complete</button>;
      return null;
    },
  };

  return (
    <>
      <ModulePage
        title="Field Visits"
        subtitle="Add a visit, then tap Check in on site: it takes a live photo and your current location together. Log the outcome when you leave."
        overview={<FieldOverview />}
        tabs={[{ label: "Visits", config: visits }]}
      />
      <CheckInCapture open={!!checkingIn} visiting={checkingIn?.row.party_name || ""} onClose={() => setCheckingIn(null)} onCapture={saveCheckIn} />
      <Modal open={!!proofUrl} onClose={() => setProofUrl(null)} title="Check-in photo">
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not an optimisable asset */}
        {proofUrl && <img src={proofUrl} alt="Photo taken at check-in" className="w-full rounded-lg" />}
      </Modal>
    </>
  );
}
