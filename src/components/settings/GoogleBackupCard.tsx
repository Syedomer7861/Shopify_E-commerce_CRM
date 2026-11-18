"use client";
import { confirmDialog } from "@/components/ConfirmDialog";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Camera, CheckCircle2, CloudUpload, ExternalLink, Loader2, Sheet } from "lucide-react";

type Status = {
  enabled: boolean;
  connected: boolean;
  email: string | null;
  sheetUrl: string | null;
  lastBackupAt: string | null;
  lastBackupStatus: string | null;
  fieldPhotosToDrive?: boolean;
  fieldVisitsToSheet?: boolean;
};

const RESULT: Record<string, [ "success" | "error", string ]> = {
  connected: ["success", "Google connected"],
  cancelled: ["error", "Google connection cancelled"],
  noscope: ["error", "Please allow Google Drive access to connect"],
  error: ["error", "Could not connect Google. Try again."],
};

/** Settings > Backup & Google: each org links its own Google Drive & Sheets. */
export default function GoogleBackupCard() {
  const params = useSearchParams();
  const [s, setS] = useState<Status | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/google/connection", { cache: "no-store" });
    if (res.ok) setS(await res.json());
    else setDenied(true);
  }, []);

  useEffect(() => {
    load();
    const r = RESULT[params.get("google") || ""];
    if (r) toast[r[0]](r[1]);
  }, [load, params]);

  const backupNow = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/google/connection", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) toast.success(data.status === "partial" ? `Backed up ${data.saved?.length ?? 0} tables; the rest go in the next run` : "Backup saved to your Google Drive");
      else toast.error(data.error || (data.status === "reconnect needed" ? "Google access was removed. Connect again." : "Backup failed"));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!await confirmDialog("Disconnect Google? Backups and the live sheet stop. Files already in your Drive stay there.")) return;
    setBusy(true);
    try {
      await fetch("/api/google/connection", { method: "DELETE" });
      toast.success("Google disconnected");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const setField = async (key: "fieldPhotosToDrive" | "fieldVisitsToSheet", value: boolean) => {
    setS(prev => (prev ? { ...prev, [key]: value } : prev));
    const res = await fetch("/api/google/connection", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: value }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) toast.success(value ? "Switched on" : "Switched off");
    else { toast.error(data.error || "Could not save"); await load(); }
  };

  if (denied) return <div className="card p-6 text-xs text-[#5f5f5d]">Only an admin of this workspace can manage Google backups.</div>;
  if (!s) return <div className="card p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#5f5f5d]" /></div>;

  return (
    <div className="card p-6 sm:p-8 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-[#1c1c1c]">Google Drive & Sheets</h3>
          <p className="text-xs text-[#5f5f5d] mt-1 max-w-xl leading-relaxed">
            A weekly backup of your customers, orders, tasks and team records goes into a <b>CodeCrest backups</b> folder in your own Google Drive,
            and new orders and customers are added to a <b>CodeCrest live data</b> sheet. The CRM can only see the files it creates.
          </p>
        </div>
        {s.connected ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#2f8a5f] bg-[#ecf8f1] border border-[#b5e4ca] rounded-full px-3 py-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Connected{s.email ? ` as ${s.email}` : ""}
          </span>
        ) : null}
      </div>

      {!s.enabled ? (
        <p className="text-xs text-[#5f5f5d]">Google connection is not switched on for this workspace yet. Ask CodeCrest to enable it.</p>
      ) : !s.connected ? (
        // Plain link: the OAuth flow is a full-page redirect.
        <a href="/api/google/connect" className="inline-flex items-center gap-2 rounded-full bg-[#1c1c1c] text-white px-5 py-2.5 text-xs font-semibold hover:bg-black">
          <CloudUpload className="w-4 h-4" /> Connect Google
        </a>
      ) : (
        <div className="space-y-4">
          <div className="text-xs text-[#5f5f5d] space-y-1">
            <p>Last backup: {s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleString() : "not yet (runs weekly)"}{s.lastBackupStatus && s.lastBackupStatus !== "ok" ? ` · ${s.lastBackupStatus}` : ""}</p>
            {s.sheetUrl && (
              <a href={s.sheetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2 text-[#1c1c1c]">
                Open live data sheet <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={backupNow} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-[#1c1c1c] text-white px-5 py-2.5 text-xs font-semibold hover:bg-black disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />} Back up now
            </button>
            {s.lastBackupStatus === "reconnect needed" && (
              <a href="/api/google/connect" className="inline-flex items-center rounded-full border border-[#1c1c1c] px-5 py-2.5 text-xs font-semibold">Connect again</a>
            )}
            <button onClick={disconnect} disabled={busy} className="text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50">Disconnect</button>
          </div>

          <div className="border-t border-[#ebece6] pt-4 space-y-3">
            <div>
              <h4 className="text-xs font-bold text-[#1c1c1c]">Field visits (offline team)</h4>
              <p className="text-[11px] text-[#5f5f5d] mt-0.5">Keep check-in photos in your own Drive instead of the app&apos;s storage, and log every visit in your sheet like the old Google Form.</p>
            </div>
            <FieldSwitch icon={<Camera className="w-4 h-4" />} on={!!s.fieldPhotosToDrive} onChange={v => setField("fieldPhotosToDrive", v)}
              title="Save check-in photos to Google Drive"
              desc="New photos go to a private “CodeCrest field visits” folder. Managers still see them in the app. If Drive is unreachable the photo is kept in the app so proof is never lost." />
            <FieldSwitch icon={<Sheet className="w-4 h-4" />} on={!!s.fieldVisitsToSheet} onChange={v => setField("fieldVisitsToSheet", v)}
              title="Log visits in Google Sheets"
              desc="Each check-in and completion adds a row to a “Field visits” tab and to a tab per executive, with location, Google Maps link and photo link." />
          </div>
        </div>
      )}

      <details className="rounded-xl bg-[#f6f7f2] px-4 py-3 text-[11px] text-[#3a3a36]">
        <summary className="cursor-pointer font-bold text-[#1c1c1c]">How to set it up</summary>
        <ol className="mt-2 space-y-1.5 list-decimal pl-4">
          <li>Click <b>Connect Google</b> and sign in with the Google account that should own the files (use a company account, not a personal one).</li>
          <li>Allow Google Drive access. The CRM can only see files it creates, never the rest of your Drive.</li>
          <li>Switch on <b>Save check-in photos to Google Drive</b> and/or <b>Log visits in Google Sheets</b>.</li>
          <li>Open the live data sheet from the link above. New tabs “Field visits” and one per executive appear after the first check-in.</li>
          <li>To share with a manager outside the CRM, share that sheet or the “CodeCrest field visits” folder from Google Drive.</li>
        </ol>
        <p className="mt-2 text-[#5f5f5d]">Photos already taken stay where they are. Disconnecting stops new uploads; files already in your Drive stay there.</p>
      </details>
    </div>
  );
}

function FieldSwitch({ icon, title, desc, on, onChange }: { icon: React.ReactNode; title: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-[#ebece6] p-3 cursor-pointer hover:border-[#c4c5bd]">
      <span className="mt-0.5 text-[#5f5f5d]">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-semibold text-[#1c1c1c]">{title}</span>
        <span className="block text-[11px] text-[#5f5f5d] leading-relaxed">{desc}</span>
      </span>
      <input type="checkbox" role="switch" checked={on} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
      <span aria-hidden className="relative mt-0.5 w-9 h-5 shrink-0 rounded-full bg-[#d4d5cd] transition-colors peer-checked:bg-[var(--accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[#1c1c1c] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
    </label>
  );
}
