"use client";

import { useEffect, useState } from "react";
import { PauseCircle } from "lucide-react";
import { createClient } from "@/lib/supabase";

/**
 * A suspended organisation's members are already locked out by the database
 * (current_org_id() returns nothing). This replaces the resulting empty pages
 * with a clear message. Only an explicit "inactive" answer shows it.
 */
export function SuspendedGate() {
  const [suspended, setSuspended] = useState(false);

  useEffect(() => {
    const db = createClient();
    db.rpc("my_org_is_active").then(({ data, error }) => {
      if (!error && data === false) setSuspended(true);
    });
    // A workspace waiting on (or locked for) payment goes to /billing.
    // Errors (e.g. before the billing migration exists) are ignored.
    db.rpc("my_org_billing").then(({ data, error }) => {
      if (!error && (data as { hold?: boolean } | null)?.hold === true) window.location.replace("/billing");
    });
  }, []);

  if (!suspended) return null;
  return (
    <div className="fixed inset-0 z-[110] bg-[#f7f4ed] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-8 border border-[#eceae4] text-center">
        <PauseCircle className="w-10 h-10 text-amber-500 mx-auto" />
        <h2 className="mt-4 text-lg font-bold text-[#1c1c1c]">Workspace paused</h2>
        <p className="mt-2 text-sm text-[#5f5f5d]">
          Your organisation&apos;s access is paused. Your data is safe and untouched. Please contact your account owner or CodeCrest support to restore access.
        </p>
        <button
          onClick={async () => { await createClient().auth.signOut(); window.location.href = "/login"; }}
          className="mt-6 h-10 px-5 rounded-xl border border-[#eceae4] text-sm font-medium text-[#1c1c1c]"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
