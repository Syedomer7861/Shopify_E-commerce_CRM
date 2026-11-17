"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavLink = { label: string; href: string; icon?: LucideIcon; dot?: string | null; badge?: number; active: boolean };
export type NavSection = { key: string; label: string | null; items: NavLink[] };

const OPEN_KEY = "nav-open-sections";

/**
 * Desktop menu: a short always-open top block, then collapsible sections.
 * The section holding the current page always opens; the rest remember what
 * the viewer last opened (per browser). New users see a short list instead of
 * fifty links at once.
 */
export function SidebarSections({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = useState<string[] | null>(null);
  useEffect(() => {
    try { setOpen(JSON.parse(localStorage.getItem(OPEN_KEY) || "[]")); } catch { setOpen([]); }
  }, []);
  const toggle = (k: string) => setOpen(prev => {
    const next = (prev ?? []).includes(k) ? (prev ?? []).filter(x => x !== k) : [...(prev ?? []), k];
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* per-browser convenience only */ }
    return next;
  });

  return (
    <div className="hidden lg:flex flex-col gap-1">
      {sections.filter(s => s.items.length > 0).map(s => {
        const holdsActive = s.items.some(i => i.active);
        const isOpen = !s.label || holdsActive || (open ?? []).includes(s.key);
        const badge = s.items.reduce((n, i) => n + (i.badge ?? 0), 0);
        return (
          <div key={s.key} className={cn(s.label && "pt-1")}>
            {s.label && (
              <button onClick={() => !holdsActive && toggle(s.key)} aria-expanded={isOpen}
                className={cn("w-full flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] whitespace-nowrap transition-colors",
                  holdsActive ? "text-[#1c1c1c] cursor-default" : "text-[#5f5f5d]/60 hover:text-[#1c1c1c] hover:bg-[rgba(28,28,28,0.04)]")}>
                <span className="flex-1 text-left truncate">{s.label}</span>
                {!isOpen && badge > 0 && <span className="text-[10px] font-bold px-1.5 rounded-full bg-rose-500 text-white normal-case tracking-normal">{badge}</span>}
                {!isOpen && <span className="text-[10px] font-semibold normal-case tracking-normal text-[#5f5f5d]/50">{s.items.length}</span>}
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", !isOpen && "-rotate-90", holdsActive && "opacity-0")} />
              </button>
            )}
            <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              <div className="overflow-hidden flex flex-col gap-0.5">
                {s.items.map(i => (
                  <Link key={i.href + i.label} href={i.href} tabIndex={isOpen ? undefined : -1} className={cn(
                    "flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 group whitespace-nowrap",
                    i.active ? "bg-[#1c1c1c] text-[#fcfbf8] shadow-sm" : "text-[#5f5f5d] hover:bg-[rgba(28,28,28,0.04)] hover:text-[#1c1c1c]"
                  )}>
                    {i.icon ? <i.icon className={cn("w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-105", i.active ? "text-[#fcfbf8]" : "text-[#5f5f5d]/60 group-hover:text-[#1c1c1c]")} />
                      : <span className="w-4 flex justify-center"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: i.dot ?? "#8b8b8b" }} /></span>}
                    <span className="flex-1 truncate">{i.label}</span>
                    {!!i.badge && <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center", i.active ? "bg-[#fcfbf8]/20 text-[#fcfbf8]" : "bg-rose-500 text-white")}>{i.badge}</span>}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
