"use client";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { PageHeader, Pagination } from "@/components/ui";
import { isDemoMode } from "@/lib/demo";
import { 
  ShoppingBag, 
  MessageCircle, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  MoreVertical,
  ExternalLink,
  Trash2
} from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { cn, orQuote } from "@/lib/utils";
import { AccessDenied } from "@/components/ui";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission } from "@/lib/permissions";
import { RefreshCw } from "lucide-react";
import { ALL_TIME, DateRangeFilter, applyDateRange, type DateRange } from "@/components/DateRangeFilter";
import { useOrgName } from "@/hooks/useOrgName";
import { isSeedBrand } from "@/lib/brand";

export default function AbandonedCartsPage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const orgName = useOrgName();
  const [carts, setCarts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [range, setRange] = useState<DateRange>(ALL_TIME);
  const [currentPage, setCurrentPage] = useState(1);
  const [globalStats, setGlobalStats] = useState({ pendingCount: 0, pendingValue: 0, recoveredValue: 0 });
  const ITEMS_PER_PAGE = 25;

  const supabase = createClient();

  // The 3 summary cards must reflect totals across every cart regardless of
  // which tab is active - they were previously derived from `carts`, the
  // same tab-filtered list the table below uses. With "Pending" selected
  // (the default), `carts` only ever held pending rows, so "Recovered
  // Revenue" computed to ₹0 no matter how many real recoveries existed.
  // Sums a value across every matching row via .range() paging - PostgREST
  // caps a single select at 1000, and "Pending Recovery: 1000" was that
  // cap, not the real count.
  const fetchGlobalStats = useCallback(async () => {
    if (isDemoMode()) return;
    try {
      const sumByStatus = async (status: string) => {
        const PAGE = 1000;
        let total = 0;
        for (let from = 0; ; from += PAGE) {
          const { data } = await applyDateRange(supabase
            .from("abandoned_carts")
            .select("total_price")
            .eq("recovery_status", status), "abandoned_at", range)
            .range(from, from + PAGE - 1);
          if (!data || data.length === 0) break;
          total += data.reduce((acc, c) => acc + (Number(c.total_price) || 0), 0);
          if (data.length < PAGE) break;
        }
        return total;
      };

      const [pendingValue, recoveredValue, { count: pendingCount }] = await Promise.all([
        sumByStatus("pending"),
        sumByStatus("recovered"),
        applyDateRange(supabase.from("abandoned_carts").select("id", { count: "exact", head: true }).eq("recovery_status", "pending"), "abandoned_at", range),
      ]);

      setGlobalStats({ pendingCount: pendingCount || 0, pendingValue, recoveredValue });
    } catch (err) {
      console.error("Failed to load abandoned cart stats:", err);
    }
  }, [supabase, range]);

  const fetchCarts = useCallback(async () => {
    const isDemo = isDemoMode();
    if (isDemo) {
      setLoading(true);
      const { MOCK_ABANDONED_CARTS } = await import("@/lib/mockData");
      setCarts(MOCK_ABANDONED_CARTS);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let orFilter: string | null = null;
      if (search) {
        const { data: matchingCustomers } = await supabase
          .from("customers")
          .select("id")
          .or(`name.ilike.${orQuote(`%${search}%`)},phone.ilike.${orQuote(`%${search}%`)}`);

        const customerIds = (matchingCustomers || []).map(c => c.id);

        orFilter = `phone.ilike.%${search}%,cart_token.ilike.%${search}%`;
        if (customerIds.length > 0) {
          orFilter += `,customer_id.in.(${customerIds.join(",")})`;
        }
      }

      // PostgREST caps a single select at 1000 rows - "Pending Recovery:
      // 1000" was that cap, not the real count, and the table below could
      // silently be missing every pending cart past the newest 1000. Page
      // through with .range() to fetch every matching row.
      const PAGE = 1000;
      let allCarts: any[] = [];
      for (let from = 0; ; from += PAGE) {
        let pageQuery = supabase
          .from("abandoned_carts")
          .select("*, customer:customers(name, phone)")
          .order("abandoned_at", { ascending: false });
        if (statusFilter !== "all") pageQuery = pageQuery.eq("recovery_status", statusFilter);
        if (orFilter) pageQuery = pageQuery.or(orFilter);
        pageQuery = applyDateRange(pageQuery, "abandoned_at", range);

        const { data, error } = await pageQuery.range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allCarts = allCarts.concat(data);
        if (data.length < PAGE) break;
      }
      setCarts(allCarts);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load abandoned carts");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, supabase, range]);

  useEffect(() => {
    fetchCarts();
    fetchGlobalStats();

    // Realtime below drives live updates; poll is only a missed-event safety
    // net, so 5 min and skip while the tab is backgrounded.
    const poll = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchCarts();
      fetchGlobalStats();
    }, 5 * 60 * 1000);

    // ── Supabase real-time: new abandoned carts appear instantly ──
    const channel = supabase
      .channel("abandoned-carts-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "abandoned_carts" },
        () => { fetchCarts(); fetchGlobalStats(); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "abandoned_carts" },
        () => { fetchCarts(); fetchGlobalStats(); })
      .subscribe();

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [fetchCarts, fetchGlobalStats, supabase]);

  async function deleteCart(id: string) {
    const isDemo = isDemoMode();
    if (isDemo) {
      toast.success("Demo: Record deleted (local only)");
      setCarts(prev => prev.filter(c => c.id !== id));
      return;
    }
    if (!await confirmDialog("Are you sure you want to delete this record?")) return;
    try {
      const { error } = await supabase.from("abandoned_carts").delete().eq("id", id);
      if (error) throw error;
      toast.success("Record deleted");
      fetchCarts();
      fetchGlobalStats();
    } catch (err) {
      toast.error("Delete failed");
    }
  }

  function getWhatsAppLink(cart: any) {
    const phone = cart.phone.replace(/\D/g, "");
    // Ensure 91 prefix for Indian numbers if not present
    const formattedPhone = phone.length === 10 ? `91${phone}` : phone;
    const name = cart.customer?.name || "Customer";
    const items = (cart.line_items as any[])?.map(i => i.title).join(", ") || "items";
    const message = `Hi ${name}, we noticed you left some ${items} in your cart at ${orgName && !isSeedBrand(orgName) ? orgName : "CureForever"}. Since these items are in high demand, we wanted to check if you had any questions or needed help completing your order?`;
    return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
  }

  const filteredCarts = carts.filter(c => 
    c.phone.includes(search) || 
    (c.customer?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const paginatedCarts = filteredCarts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );


  return (
    <div className="animate-fade-in pb-10">
      <PageHeader 
        title="Abandoned Carts" 
        subtitle="Recover lost revenue by following up with interested shoppers"
      />

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card p-5 border-l-4 border-l-[#1c1c1c]">
          <div className="flex items-center gap-3 mb-2 text-[#6b6b67]">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Pending Recovery</span>
          </div>
          <div className="text-2xl font-display text-[#1c1c1c] font-bold">{globalStats.pendingCount}</div>
          <div className="text-[10px] text-[#9a9a94] mt-1">Carts waiting for follow-up</div>
        </div>
        <div className="card p-5 border-l-4 border-l-rose-400">
          <div className="flex items-center gap-3 mb-2 text-[#6b6b67]">
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Potential Revenue</span>
          </div>
          <div className="text-2xl font-display text-[#1c1c1c] font-bold">₹{globalStats.pendingValue.toLocaleString()}</div>
          <div className="text-[10px] text-[#9a9a94] mt-1">Value of carts not yet recovered</div>
        </div>
        <div className="card p-5 border-l-4 border-l-[#1c1c1c]">
          <div className="flex items-center gap-3 mb-2 text-[#6b6b67]">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Recovered Revenue</span>
          </div>
          <div className="text-2xl font-display text-[#1c1c1c] font-bold">₹{globalStats.recoveredValue.toLocaleString()}</div>
          <div className="text-[10px] text-[#9a9a94] mt-1">Orders secured after follow-up</div>
        </div>
      </div>

      {/* Filters & Actions */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9a9a94]" />
          <input 
            type="text" 
            placeholder="Search by name or phone..." 
            className="input pl-10 h-10 text-sm w-full"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <DateRangeFilter value={range} onChange={r => { setRange(r); setCurrentPage(1); }} />
        <div className="flex gap-2">
          {["pending", "recovered", "all"].map(f => (
            <button 
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn("px-4 h-10 text-xs font-semibold rounded-xl transition-all capitalize",
                statusFilter === f ? "bg-[#1c1c1c] text-white shadow-sm" : "bg-white text-[#6b6b67] border border-[#ebece6] hover:bg-[#f6f7f2]"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Cart List */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f6f7f2]/50 border-b border-[#ebece6]">
                <th className="text-left py-4 px-6 text-[10px] font-bold text-[#9a9a94] uppercase tracking-wider">Customer info</th>
                <th className="text-left py-4 px-6 text-[10px] font-bold text-[#9a9a94] uppercase tracking-wider">Cart Details</th>
                <th className="text-left py-4 px-6 text-[10px] font-bold text-[#9a9a94] uppercase tracking-wider">Abandoned At</th>
                <th className="text-left py-4 px-6 text-[10px] font-bold text-[#9a9a94] uppercase tracking-wider">Status</th>
                <th className="text-right py-4 px-6 text-[10px] font-bold text-[#9a9a94] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f6f7f2]">
              {loading ? (
                <tr><td colSpan={5} className="py-20 text-center text-[#9a9a94]">Loading abandoned carts...</td></tr>
              ) : filteredCarts.length === 0 ? (
                <tr><td colSpan={5} className="py-20 text-center text-[#9a9a94] italic">No carts found matching your filters.</td></tr>
              ) : paginatedCarts.map(cart => (
                <tr key={cart.id} className="hover:bg-[#f6f7f2]/30 transition-colors group">
                  <td className="py-4 px-6">
                    <div className="font-semibold text-[#1c1c1c] uppercase tracking-tight">{cart.customer?.name || "Anonymous"}</div>
                    <div className="text-xs text-[#6b6b67] font-mono">{cart.phone}</div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2 mb-1">
                      <ShoppingBag className="w-3.5 h-3.5 text-[#9a9a94]" />
                      <span className="font-bold text-[#3a3a36]">₹{cart.total_price?.toLocaleString()}</span>
                    </div>
                    <div className="text-[11px] text-[#9a9a94] truncate max-w-[200px]">
                      {(cart.line_items as any[])?.map(i => i.title).join(", ") || "No items"}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-xs text-[#6b6b67]">
                    {format(new Date(cart.abandoned_at), "MMM dd, hh:mm a")}
                  </td>
                  <td className="py-4 px-6">
                     <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                       cart.recovery_status === "recovered" ? "bg-[#ebece6] text-[#1c1c1c]" : "bg-amber-100 text-amber-600"
                     )}>
                      {cart.recovery_status}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                       {cart.phone && cart.phone.replace(/\D/g, "").length >= 10 ? (
                         <a
                          href={getWhatsAppLink(cart)}
                          target="_blank"
                          className="btn-primary py-1.5 px-3 h-8 text-[10px] bg-[#25D366] border-none hover:bg-[#128C7E] flex items-center gap-1.5 shadow-none"
                        >
                          <MessageCircle className="w-3 h-3" /> Follow Up
                        </a>
                       ) : (
                         // No real phone to message (e.g. phone: "unknown"
                         // from ingestion when nothing was resolvable) - the
                         // button used to render anyway and produce a broken
                         // wa.me link with no recipient.
                         <span className="py-1.5 px-3 h-8 text-[10px] text-[#d4d5cd] flex items-center gap-1.5" title="No phone number on file">
                           <MessageCircle className="w-3 h-3" /> No Phone
                         </span>
                       )}
                      <button
                        onClick={() => deleteCart(cart.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-[#9a9a94] hover:text-rose-500 transition-colors"
                        title="Delete record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 border-t border-[#f6f7f2] bg-white">
          <Pagination 
            current={currentPage}
            total={filteredCarts.length}
            pageSize={ITEMS_PER_PAGE}
            onChange={setCurrentPage}
          />
        </div>
      </div>
    </div>
  );
}
