"use client";
import { useState, useEffect } from "react";
import { isTypingInField } from "@/lib/utils";

const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: "Ctrl/Cmd + K", desc: "Open search" },
  { keys: "/", desc: "Open search" },
  { keys: "N", desc: "Open notifications" },
  { keys: "Esc", desc: "Close whatever's open" },
  { keys: "?", desc: "Show this list" },
];

export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "?" && !isTypingInField(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#1c1c1c]/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-sm bg-[#f7f4ed] rounded-2xl shadow-2xl border border-[#eceae4] overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#eceae4]">
          <h3 className="text-xs font-black uppercase tracking-widest text-[#1c1c1c]">Keyboard Shortcuts</h3>
          <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-lg hover:bg-[#eceae4] flex items-center justify-center text-[#5f5f5d] hover:text-[#1c1c1c] transition-colors">✕</button>
        </div>
        <div className="p-5 space-y-3">
          {SHORTCUTS.map(s => (
            <div key={s.keys} className="flex items-center justify-between text-xs">
              <span className="text-[#5f5f5d] font-medium">{s.desc}</span>
              <kbd className="text-[10px] font-black text-[#1c1c1c] bg-[#eceae4] px-2 py-1 rounded">{s.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
