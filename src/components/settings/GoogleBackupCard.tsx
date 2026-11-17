"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { CheckCircle2, CloudUpload, ExternalLink, Loader2 } from "lucide-react";

type Status = {
  enabled: boolean;
  connected: boolean;
  email: string | null;
  sheetUrl: string | null;
  lastBackupAt: string | null;
  lastBackupStatus: string | null;
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
    if (!confirm("Disconnect Google? Backups and the live sheet stop. Files already in your Drive stay there.")) return;
    setBusy(true);
    try {
      await fetch("/api/google/connection", { method: "DELETE" });
      toast.success("Google disconnected");
      await load();
    } finally {
      setBusy(false);
    }
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
        </div>
      )}
    </div>
  );
}
