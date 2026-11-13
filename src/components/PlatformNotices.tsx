"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Notice = { id: string; title: string; body: string; level: "info" | "warning" };

const KEY = "cc-dismissed-notices";

function dismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

/**
 * Notices the platform owner aimed at this workspace. The database decides
 * which ones (my_platform_notices); dismissing only hides it in this browser.
 * Errors (e.g. before the migration exists) show nothing.
 */
export function PlatformNotices() {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    createClient().rpc("my_platform_notices").then(({ data, error }) => {
      if (error || !Array.isArray(data)) return;
      const hidden = dismissed();
      setNotices((data as Notice[]).filter((n) => !hidden.includes(n.id)));
    });
  }, []);

  function dismiss(id: string) {
    setNotices((list) => list.filter((n) => n.id !== id));
    try { localStorage.setItem(KEY, JSON.stringify([...dismissed(), id].slice(-50))); } catch { /* private mode: hides until reload */ }
  }

  if (notices.length === 0) return null;
  return (
    <div className="space-y-2 mb-4">
      {notices.map((n) => {
        const Icon = n.level === "warning" ? AlertTriangle : Info;
        return (
          <div key={n.id} role={n.level === "warning" ? "alert" : "status"}
            className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm",
              n.level === "warning" ? "bg-amber-50 border-amber-200" : "bg-white border-[#eceae4]")}>
            <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", n.level === "warning" ? "text-amber-600" : "text-[#5f5f5d]")} aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[#1c1c1c]">{n.title}</div>
              {n.body && <p className="text-[#5f5f5d] whitespace-pre-line break-words">{n.body}</p>}
            </div>
            <button onClick={() => dismiss(n.id)} aria-label="Dismiss notice" className="p-1 -m-1 h-fit text-[#5f5f5d] hover:text-[#1c1c1c]">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
