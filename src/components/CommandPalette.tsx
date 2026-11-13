"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, User, Package, ListChecks, Loader2, Target, Handshake, LifeBuoy, FileText, Building2, Users, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { isTypingInField } from "@/lib/utils";

// Global Cmd+K / Ctrl+K search across every record type. Each query runs in
// the browser under row security, so results are limited to the viewer's
// organisation and to the records their role can see - a table they have no
// access to simply returns nothing. Task search reuses the Tasks page's own
// search via ?id=; record pages open on the right tab with ?tab= and ?q=.

type Row = Record<string, any>;
type Source = {
  key: string;
  label: string;
  icon: LucideIcon;
  table: string;
  select: string;
  cols: (q: string, isPhone: boolean) => string[];
  title: (r: Row) => string;
  sub: (r: Row) => string | null | undefined;
  href: (r: Row, q: string) => string;
};

const recordLink = (path: string, tab: string, q: string) => `${path}?tab=${tab}&q=${encodeURIComponent(q)}`;

const SOURCES: Source[] = [
  {
    key: "customers", label: "Customers", icon: User, table: "customers", select: "id, name, email, phone",
    cols: (q, isPhone) => isPhone ? [`phone.eq.${q}`, `phone.ilike.%${q}%`] : [`name.ilike.%${q}%`, `email.ilike.%${q}%`],
    title: r => r.name || r.email || "Unnamed", sub: r => r.phone || r.email, href: r => `/customers/${r.id}`,
  },
  {
    key: "orders", label: "Orders", icon: Package, table: "orders", select: "id, order_number, tracking_number, customer:customers(name)",
    cols: q => [`order_number.ilike.%${q}%`, `tracking_number.ilike.%${q}%`],
    title: r => `#${r.order_number || r.tracking_number}`, sub: r => r.customer?.name, href: r => `/orders?id=${r.id}`,
  },
  {
    key: "leads", label: "Leads", icon: Target, table: "leads", select: "id, name, company, phone, status",
    cols: q => [`name.ilike.%${q}%`, `company.ilike.%${q}%`, `phone.ilike.%${q}%`, `email.ilike.%${q}%`],
    title: r => r.name, sub: r => [r.company, r.status].filter(Boolean).join(" · "), href: (r, q) => recordLink("/leads", "leads", r.name || q),
  },
  {
    key: "deals", label: "Deals", icon: Handshake, table: "deals", select: "id, title, status",
    cols: q => [`title.ilike.%${q}%`],
    title: r => r.title, sub: r => r.status, href: (r, q) => recordLink("/leads", "deals", r.title || q),
  },
  {
    key: "tickets", label: "Tickets", icon: LifeBuoy, table: "tickets", select: "id, subject, status",
    cols: q => [`subject.ilike.%${q}%`],
    title: r => r.subject, sub: r => r.status, href: (r, q) => recordLink("/service-desk", "tickets", r.subject || q),
  },
  {
    key: "invoices", label: "Invoices", icon: FileText, table: "invoices", select: "id, number, status",
    cols: q => [`number.ilike.%${q}%`],
    title: r => r.number, sub: r => r.status, href: (r, q) => recordLink("/finance", "invoices", r.number || q),
  },
  {
    key: "vendors", label: "Vendors", icon: Building2, table: "vendors", select: "id, name",
    cols: q => [`name.ilike.%${q}%`],
    title: r => r.name, sub: () => null, href: (r, q) => recordLink("/finance", "vendors", r.name || q),
  },
  {
    key: "people", label: "Team", icon: Users, table: "profiles", select: "id, name, email, role",
    cols: q => [`name.ilike.%${q}%`, `email.ilike.%${q}%`],
    title: r => r.name || r.email, sub: r => r.role, href: () => "/team",
  },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Record<string, Row[]>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === "/" && !isTypingInField(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults({});
      // Wait a tick for the input to mount before focusing.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const runSearch = useCallback(async (q: string) => {
    // Characters that are filter syntax in the query string are dropped, so a
    // search term can only ever be a search term.
    const cleanQ = q.trim().replace(/^#/, "").replace(/[,()*%\\"]/g, " ").trim();
    if (cleanQ.length < 2) {
      setResults({});
      setLoading(false);
      return;
    }
    const isPhone = /^\d{7,15}$/.test(cleanQ.replace(/\s/g, ""));
    const settled = await Promise.allSettled(SOURCES.map(s =>
      supabase.from(s.table).select(s.select).or(s.cols(cleanQ, isPhone).join(",")).limit(5)
    ));
    const next: Record<string, Row[]> = {};
    settled.forEach((r, i) => {
      // A table the viewer can't read (or a module not set up) just contributes nothing.
      if (r.status === "fulfilled" && !r.value.error) next[SOURCES[i].key] = (r.value.data as unknown as Row[]) || [];
    });
    setResults(next);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!open) return;
    setLoading(query.trim().length >= 2);
    const t = setTimeout(() => runSearch(query), 250);
    return () => clearTimeout(t);
  }, [query, open, runSearch]);

  const goTo = useCallback((path: string) => {
    setOpen(false);
    router.push(path);
  }, [router]);

  const cleanQuery = query.trim();
  const groups = SOURCES.filter(s => results[s.key]?.length);
  const first = groups[0];

  // Discoverable entry point - most users won't know the Cmd+K shortcut
  // exists otherwise. Kept self-contained here rather than wired into
  // Sidebar.tsx to avoid touching that large, already-complex layout file.
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="fixed bottom-24 right-4 lg:bottom-6 lg:right-6 z-40 w-11 h-11 rounded-full bg-[#1c1c1c] text-[#f7f4ed] shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      >
        <Search className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-[#1c1c1c]/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl bg-[#f7f4ed] rounded-2xl shadow-2xl border border-[#eceae4] overflow-hidden animate-slide-up">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#eceae4]">
          {loading ? <Loader2 className="w-4 h-4 text-[#5f5f5d] animate-spin" /> : <Search className="w-4 h-4 text-[#5f5f5d]" />}
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && cleanQuery.length >= 2) {
                if (first) goTo(first.href(results[first.key][0], cleanQuery));
                else goTo(`/tasks?id=${encodeURIComponent(cleanQuery)}`);
              }
            }}
            placeholder="Search customers, orders, leads, deals, tickets, invoices, people..."
            className="flex-1 bg-transparent outline-none text-sm font-medium text-[#1c1c1c] placeholder:text-[#1c1c1c]/30"
          />
          <kbd className="text-[9px] font-black text-[#5f5f5d] bg-[#eceae4] px-1.5 py-0.5 rounded uppercase tracking-widest">Esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {cleanQuery.length < 2 ? (
            <div className="p-8 text-center text-[#5f5f5d] text-xs font-medium">Type at least 2 characters to search.</div>
          ) : !loading && groups.length === 0 ? (
            <div className="p-8 text-center text-[#5f5f5d] text-xs font-medium">Nothing matched.</div>
          ) : (
            groups.map((s, gi) => (
              <div key={s.key} className={`py-2 ${gi ? "border-t border-[#eceae4]" : ""}`}>
                <div className="px-5 pb-1 text-[9px] font-black uppercase tracking-widest text-[#5f5f5d]/60">{s.label}</div>
                {results[s.key].map(r => (
                  <button key={r.id} onClick={() => goTo(s.href(r, cleanQuery))}
                    className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-[#eceae4]/50 transition-colors text-left">
                    <s.icon className="w-3.5 h-3.5 text-[#5f5f5d] shrink-0" />
                    <span className="text-sm font-bold text-[#1c1c1c] truncate">{s.title(r) || "Untitled"}</span>
                    <span className="text-[10px] text-[#5f5f5d] truncate">{s.sub(r)}</span>
                  </button>
                ))}
              </div>
            ))
          )}
          {cleanQuery.length >= 2 && (
            <button onClick={() => goTo(`/tasks?id=${encodeURIComponent(cleanQuery)}`)}
              className="w-full flex items-center gap-3 px-5 py-3 border-t border-[#eceae4] hover:bg-[#eceae4]/50 transition-colors text-left">
              <ListChecks className="w-3.5 h-3.5 text-[#5f5f5d] shrink-0" />
              <span className="text-xs font-bold text-[#1c1c1c]">Search tasks for &quot;{cleanQuery}&quot;</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
