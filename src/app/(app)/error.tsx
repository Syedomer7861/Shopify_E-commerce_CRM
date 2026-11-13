"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

// One broken page must not take the whole app down: the sidebar and chat stay,
// only this page shows the message and a retry.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="max-w-md mx-auto mt-16 text-center bg-white border border-gray-200 rounded-2xl p-8">
      <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
      <h2 className="mt-4 text-lg font-semibold text-gray-900">This page hit a problem</h2>
      <p className="mt-2 text-sm text-gray-500">
        Nothing was lost. Try again, or go back to your dashboard.
        {error.digest && <span className="block mt-1 text-xs text-gray-400">Reference: {error.digest}</span>}
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={reset} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1c1c1c] text-white text-sm font-medium">
          <RotateCcw className="w-4 h-4" /> Try again
        </button>
        <Link href="/dashboard" className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
