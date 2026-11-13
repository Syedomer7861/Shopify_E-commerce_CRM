"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase";

/** True when this account has two-factor on but the current session hasn't passed it yet. */
export async function needsSecondFactor(): Promise<boolean> {
  const { data } = await createClient().auth.mfa.getAuthenticatorAssuranceLevel();
  return !!data && data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

/** Six-digit authenticator code step. Calls onDone once the session is upgraded. */
export function MfaChallenge({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.[0];
    if (listErr || !factor) {
      setError("No authenticator found on this account.");
      setBusy(false);
      return;
    }
    const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    setBusy(false);
    if (verifyErr) {
      setError("That code didn't match. Check your authenticator app and try again.");
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-6 h-6 text-emerald-600" />
        <div>
          <h2 className="text-lg font-bold text-[#1c1c1c]">Two-factor check</h2>
          <p className="text-xs text-[#5f5f5d]">Enter the 6-digit code from your authenticator app.</p>
        </div>
      </div>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        autoFocus
        required
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className="w-full h-14 text-center tracking-[0.5em] text-xl font-semibold bg-[#fcfbf8] border border-[#eceae4] rounded-2xl focus:outline-none focus:border-[#1c1c1c]/30"
        placeholder="000000"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy || code.length !== 6}
        className="w-full h-12 bg-[#1c1c1c] text-white font-semibold rounded-2xl disabled:opacity-50">
        {busy ? "Checking…" : "Verify"}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="w-full text-xs text-[#5f5f5d] hover:text-[#1c1c1c]">
          Sign out
        </button>
      )}
    </form>
  );
}

/**
 * Backstop inside the app: if a session reaches a page without passing the
 * second factor (old tab, direct link), cover the app until the code is given.
 */
export function MfaGate() {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    needsSecondFactor().then(setBlocked).catch(() => {});
  }, []);
  if (!blocked) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-[#f7f4ed] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-8 border border-[#eceae4]">
        <MfaChallenge
          onDone={() => window.location.reload()}
          onCancel={async () => { await createClient().auth.signOut(); window.location.href = "/login"; }}
        />
      </div>
    </div>
  );
}
