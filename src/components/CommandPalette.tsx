"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, User, Package, ListChecks, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { isTypingInField } from "@/lib/utils";

// Global Cmd+K / Ctrl+K search - jump to any customer or order from
// anywhere in the app, without hunting through pages. Task search reuses
// the Tasks page's own robust search (customer/order/cart/UUID matching
// already built there via ?id=) instead of duplicating that logic here.

type CustomerResult = { id: string; name: string | null; email: string | null; phone: string | null };
type OrderResult = { id: string; order_number: string | null; tracking_number: string | null; customer: { name: string | null } | null };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<CustomerResult[]>([]);
  const [orders, setOrders] = useState<OrderResult[]>([]);
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
      setCustomers([]);
      setOrders([]);
      // Wait a tick for the input to mount before focusing.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const runSearch = useCallback(async (q: string) => {
    const cleanQ = q.trim().replace(/^#/, "");
    if (cleanQ.length < 2) {
      setCustomers([]);
      setOrders([]);
      setLoading(false);
      return;
    }
    const isPhone = /^\d{7,15}$/.test(cleanQ.replace(/\s/g, ""));
    try {
      const [customerRes, orderRes] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, email, phone")
          .or(isPhone
            ? `phone.eq.${cleanQ},phone.ilike.%${cleanQ}%`
            : `name.ilike.%${cleanQ}%,email.ilike.%${cleanQ}%`)
          .limit(5),
        supabase
          .from("orders")
          .select("id, order_number, tracking_number, customer:customers(name)")
          .or(`order_number.ilike.%${cleanQ}%,tracking_number.ilike.%${cleanQ}%`)
          .limit(5),
      ]);
      setCustomers((customerRes.data as any) || []);
      setOrders((orderRes.data as any) || []);
    } catch (err) {
      console.error("Command palette search failed:", err);
    } finally {
      setLoading(false);
    }
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
  const hasResults = customers.length > 0 || orders.length > 0;

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
                if (customers[0]) goTo(`/customers/${customers[0].id}`);
                else if (orders[0]) goTo(`/orders?id=${orders[0].id}`);
                else goTo(`/tasks?id=${encodeURIComponent(cleanQuery)}`);
              }
            }}
            placeholder="Search customers, orders, tasks..."
            className="flex-1 bg-transparent outline-none text-sm font-medium text-[#1c1c1c] placeholder:text-[#1c1c1c]/30"
          />
          <kbd className="text-[9px] font-black text-[#5f5f5d] bg-[#eceae4] px-1.5 py-0.5 rounded uppercase tracking-widest">Esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {cleanQuery.length < 2 ? (
            <div className="p-8 text-center text-[#5f5f5d] text-xs font-medium">Type at least 2 characters to search.</div>
          ) : !loading && !hasResults ? (
            <div className="p-8 text-center text-[#5f5f5d] text-xs font-medium">No customers or orders matched.</div>
          ) : (
            <>
              {customers.length > 0 && (
                <div className="py-2">
                  <div className="px-5 pb-1 text-[9px] font-black uppercase tracking-widest text-[#5f5f5d]/60">Customers</div>
                  {customers.map(c => (
                    <button key={c.id} onClick={() => goTo(`/customers/${c.id}`)}
                      className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-[#eceae4]/50 transition-colors text-left">
                      <User className="w-3.5 h-3.5 text-[#5f5f5d] shrink-0" />
                      <span className="text-sm font-bold text-[#1c1c1c] truncate">{c.name || c.email || "Unnamed"}</span>
                      <span className="text-[10px] text-[#5f5f5d] truncate">{c.phone || c.email}</span>
                    </button>
                  ))}
                </div>
              )}
              {orders.length > 0 && (
                <div className="py-2 border-t border-[#eceae4]">
                  <div className="px-5 pb-1 text-[9px] font-black uppercase tracking-widest text-[#5f5f5d]/60">Orders</div>
                  {orders.map(o => (
                    <button key={o.id} onClick={() => goTo(`/orders?id=${o.id}`)}
                      className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-[#eceae4]/50 transition-colors text-left">
                      <Package className="w-3.5 h-3.5 text-[#5f5f5d] shrink-0" />
                      <span className="text-sm font-bold text-[#1c1c1c] truncate">#{o.order_number || o.tracking_number}</span>
                      <span className="text-[10px] text-[#5f5f5d] truncate">{o.customer?.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
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
