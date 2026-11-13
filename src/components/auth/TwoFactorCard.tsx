"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase";

type Pending = { factorId: string; qr: string; secret: string };

/** Turn two-factor (authenticator app) on or off for the signed-in user. */
export function TwoFactorCard() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const { data } = await createClient().auth.mfa.listFactors();
    setFactorId(data?.totp?.[0]?.id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function start() {
    setBusy(true);
    const supabase = createClient();
    // Clear any half-finished setup so enrolling again doesn't fail on a duplicate.
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const f of all?.all ?? []) {
      if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${Date.now()}` });
    setBusy(false);
    if (error || !data) { toast.error(error?.message || "Could not start setup"); return; }
    setPending({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    setBusy(true);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: pending.factorId, code: code.trim() });
    setBusy(false);
    if (error) { toast.error("Code didn't match. Try the newest code."); return; }
    toast.success("Two-factor sign-in is on");
    setPending(null);
    setCode("");
    refresh();
  }

  async function turnOff() {
    if (!factorId || !window.confirm("Turn off two-factor sign-in? Your account will only need a password.")) return;
    setBusy(true);
    const { error } = await createClient().auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Two-factor sign-in is off");
    refresh();
  }

  if (loading) return null;

  return (
    <div className="bg-white border border-[#eceae4] rounded-2xl p-5">
      <div className="flex items-center gap-2">
        {factorId ? <ShieldCheck className="w-5 h-5 text-emerald-600" /> : <ShieldOff className="w-5 h-5 text-gray-400" />}
        <h3 className="text-sm font-bold text-[#1c1c1c]">Two-factor sign-in</h3>
        <span className={`ml-auto text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${factorId ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
          {factorId ? "On" : "Off"}
        </span>
      </div>
      <p className="mt-2 text-xs text-[#5f5f5d]">
        {factorId
          ? "Signing in needs your password and a code from your authenticator app."
          : "Protect your account with a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password)."}
      </p>

      {pending ? (
        <form onSubmit={verify}className="mt-4 space-y-3">
          <p className="text-xs text-[#1c1c1c]">1. Scan this with your authenticator app:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pending.qr} alt="Authenticator QR code" className="w-40 h-40 mx-auto" />
          <p className="text-[11px] text-[#5f5f5d] break-all text-center">Or enter the key: <span className="font-mono">{pending.secret}</span></p>
          <p className="text-xs text-[#1c1c1c]">2. Enter the 6-digit code it shows:</p>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full h-11 text-center tracking-[0.4em] font-semibold border border-[#eceae4] rounded-xl" placeholder="000000" />
          <div className="flex gap-2">
            <button type="submit" disabled={busy || code.length !== 6} className="flex-1 h-10 bg-[#1c1c1c] text-white text-sm font-semibold rounded-xl disabled:opacity-50">Turn on</button>
            <button type="button" onClick={() => setPending(null)} className="h-10 px-4 border border-[#eceae4] text-sm rounded-xl">Cancel</button>
          </div>
        </form>
      ) : factorId ? (
        <button onClick={turnOff} disabled={busy} className="mt-4 h-9 px-4 border border-red-200 text-red-600 text-xs font-semibold rounded-xl disabled:opacity-50">Turn off</button>
      ) : (
        <button onClick={start} disabled={busy} className="mt-4 h-9 px-4 bg-[#1c1c1c] text-white text-xs font-semibold rounded-xl disabled:opacity-50">Set up</button>
      )}
    </div>
  );
}
