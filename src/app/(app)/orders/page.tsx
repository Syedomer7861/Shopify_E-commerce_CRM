"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, Package, RefreshCw, Trash2, Download, MessageSquare, ExternalLink, Filter } from "lucide-react";
import Link from "next/link";
import { PageHeader, DeliveryBadge, RiskBadge, Avatar, EmptyState, Modal, Pagination } from "@/components/ui";
import dynamic from 'next/dynamic';
import { isDemoMode } from "@/lib/demo";
const ShiprocketOrderView = dynamic(() => import("@/components/ShiprocketOrderView"), { 
  loading: () => <div className="p-8 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto text-gray-300" /></div>
});
import { createClient } from "@/lib/supabase";
import { cn, formatDate, formatCurrency, orQuote } from "@/lib/utils";
import type { Order, DeliveryStatus, Customer } from "@/types";
import toast from "react-hot-toast";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";

const STATUSES: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Delivered", value: "delivered" },
  { label: "In Transit", value: "in_transit" },
  { label: "Out for Delivery", value: "out_for_delivery" },
  { label: "RTO", value: "rto" },
  { label: "Pending", value: "pending" },
  { label: "Failed", value: "failed" },
];

export default function OrdersPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<(Order & { customer: Customer })[]>([]);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState({ delivered: 0, in_transit: 0, out_for_delivery: 0, rto: 0, pending: 0, failed: 0 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteModal, setDeleteModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const { profile } = useCurrentProfile();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) setSelectedOrderId(id);
  }, []);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalMatching, setTotalMatching] = useState(0);

  const supabase = useMemo(() => createClient(), []);

  const fetchOrders = useCallback(async (isSilent = false) => {
    const isDemo = isDemoMode();
    if (isDemo) {
      if (!isSilent) setLoading(true);
      const { MOCK_ORDERS } = await import("@/lib/mockData");
      setOrders(MOCK_ORDERS as any);
      setStats({
        delivered: 1,
        in_transit: 1,
        out_for_delivery: 0,
        rto: 0,
        pending: 0,
        failed: 0,
      });
      setTotalMatching(MOCK_ORDERS.length);
      setLoading(false);
      return;
    }

    if (!isSilent) setLoading(true);
    
    // Helper to apply advanced filters once to any query
    const applyAdvancedFilters = (q: any) => {
      if (startDate) q = q.gte("ordered_at", `${startDate}T00:00:00Z`);
      if (endDate) q = q.lte("ordered_at", `${endDate}T23:59:59Z`);
      if (minAmount) q = q.gte("total_price", parseFloat(minAmount));
      if (maxAmount) q = q.lte("total_price", parseFloat(maxAmount));
      return q;
    };

    // "estimated" uses planner stats for large result sets (exact for small
    // ones) - the header total is "~20,647", it doesn't need a full-table
    // scan on every page load, especially while the DB is throttled.
    let query = supabase.from("orders").select("*, customer:customers!inner(*)", { count: "estimated" });
    query = applyAdvancedFilters(query);

    if (status !== "all") {
      query = query.eq("delivery_status", status);
    }

    if (search) {
      const cleanSearch = search.trim().replace(/^#/, "");
      const isPhone = /^\d{7,15}$/.test(cleanSearch.replace(/\s/g, ""));

      let customerQuery = supabase.from("customers").select("id");
      if (isPhone) {
        customerQuery = customerQuery.or(`phone.eq.${orQuote(cleanSearch)},phone.ilike.${orQuote(`%${cleanSearch}%`)}`);
      } else {
        customerQuery = customerQuery.ilike("name", `%${cleanSearch}%`);
      }
      
      const { data: matchingCustomers } = await customerQuery.limit(50);
      const customerIds = (matchingCustomers || []).map(c => c.id);

      let orFilter = `order_number.ilike.%${cleanSearch}%,tracking_number.ilike.%${cleanSearch}%`;
      if (customerIds.length > 0) {
        orFilter += `,customer_id.in.(${customerIds.join(",")})`;
      }
      query = query.or(orFilter);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data: ordersData, count: matchingCount } = await query
      .order("ordered_at", { ascending: false })
      .range(from, to);

    setTotalMatching(matchingCount || 0);

    const countQuery = (s: string) => {
      let q = supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("delivery_status", s);
      return applyAdvancedFilters(q);
    };

    const [d, t, ofd, r, p, f] = await Promise.all([
      countQuery("delivered"),
      countQuery("in_transit"),
      countQuery("out_for_delivery"),
      countQuery("rto"),
      countQuery("pending"),
      countQuery("failed"),
    ]);

    setOrders((ordersData || []) as any);
    setStats({
      delivered: d.count || 0,
      in_transit: t.count || 0,
      out_for_delivery: ofd.count || 0,
      rto: r.count || 0,
      pending: p.count || 0,
      failed: f.count || 0,
    });
    setLoading(false);
  }, [page, pageSize, status, search, startDate, endDate, minAmount, maxAmount, supabase]);

  useEffect(() => {
    // Initial fetch
    fetchOrders();
  }, [page, status, search, startDate, endDate, minAmount, maxAmount, fetchOrders]);

  // Reset to page 1 on filter change
  useEffect(() => {
    setPage(1);
  }, [status, search, startDate, endDate, minAmount, maxAmount]);

  useEffect(() => {
    // Realtime below drives live updates; this is only a missed-event
    // safety net, so 5 min (and skip if the tab is hidden).
    const pollInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchOrders(true);
    }, 5 * 60 * 1000);

    let refreshTimeout: NodeJS.Timeout;
    const debouncedRefresh = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const isInteracting = document.activeElement?.tagName === 'INPUT' ||
                           document.activeElement?.tagName === 'TEXTAREA' ||
                           document.querySelector('[role="dialog"]');
      if (isInteracting) return;
      clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => fetchOrders(true), 3000);
    };

    // ── Supabase real-time: refresh when orders are inserted or updated ──
    const channel = supabase
      .channel("orders-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, debouncedRefresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, debouncedRefresh)
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      clearTimeout(refreshTimeout);
      supabase.removeChannel(channel);
    };
  }, [page, status, search, startDate, endDate, minAmount, maxAmount, fetchOrders, supabase]);

  async function handleShiprocketSync() {
    const isDemo = isDemoMode();
    if (isDemo) {
      toast.success("Demo: Shiprocket sync simulated!");
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/shiprocket", { method: "POST" });
      // A platform-level failure (function timeout, gateway error) returns
      // Vercel's own plain-text page, not JSON - res.json() throwing a raw
      // SyntaxError on that is where the old "Unexpected token 'A'..." toast
      // came from. Read as text first so a non-JSON response shows a real
      // message instead of a parser error.
      const raw = await res.text();
      let data: any;
      try { data = JSON.parse(raw); } catch { throw new Error(res.ok ? "Server sent an unreadable response" : `Server error (${res.status}) - the sync may have taken too long`); }
      if (data.success) {
        const msg = `Shiprocket Sync Complete! Updated ${data.report.orders_processed} tracking statuses.`;
        toast.success(data.report.truncated ? `${msg} (ran out of time - rerun to continue)` : msg);
      } else throw new Error(data.error);
    } catch (err: any) {
      toast.error("Shiprocket Sync Failed: " + err.message);
    } finally {
      await fetchOrders();
      setSyncing(false);
    }
  }


  async function handleGlobalSync() {
    const isDemo = isDemoMode();
    if (isDemo) {
      toast.success("Demo: Internal system sync simulated!");
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/all", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(`Internal Sync Complete!`);
      } else {
        toast.error(data.error || "Sync failed");
      }
    } catch (err) {
      toast.error("Failed to sync system");
    } finally {
      await fetchOrders();
      setSyncing(false);
    }
  }

  async function handleExportCsv() {
    // This had zero demo-mode check and queries real orders/customers
    // directly - a demo session (a real Supabase login) could download up
    // to 5,000 real customer names/phones/orders as a CSV.
    if (isDemoMode()) {
      toast.error("Export disabled in Demo Mode to protect real customer data");
      return;
    }
    setIsExporting(true);
    const toastId = toast.loading("Preparing full dataset export...");

    try {
      // 1. Build query mirroring active filters
      const applyAdvancedFilters = (q: any) => {
        if (startDate) q = q.gte("ordered_at", `${startDate}T00:00:00Z`);
        if (endDate) q = q.lte("ordered_at", `${endDate}T23:59:59Z`);
        if (minAmount) q = q.gte("total_price", parseFloat(minAmount));
        if (maxAmount) q = q.lte("total_price", parseFloat(maxAmount));
        return q;
      };

      let query = supabase.from("orders").select("*, customer:customers!inner(*)");
      query = applyAdvancedFilters(query);

      if (status !== "all") {
        query = query.eq("delivery_status", status);
      }

      if (search) {
        const cleanSearch = search.trim().replace(/^#/, "");
        const isPhone = /^\d{7,15}$/.test(cleanSearch.replace(/\s/g, ""));

        let customerQuery = supabase.from("customers").select("id");
        if (isPhone) {
          customerQuery = customerQuery.or(`phone.eq.${orQuote(cleanSearch)},phone.ilike.${orQuote(`%${cleanSearch}%`)}`);
        } else {
          customerQuery = customerQuery.ilike("name", `%${cleanSearch}%`);
        }

        const { data: customers } = await customerQuery;
        const customerIds = customers?.map(c => c.id) || [];

        if (customerIds.length > 0) {
          query = query.or(`order_number.ilike.${orQuote(`%${cleanSearch}%`)},tracking_number.ilike.${orQuote(`%${cleanSearch}%`)},customer_id.in.(${customerIds.join(",")})`);
        } else {
          query = query.or(`order_number.ilike.${orQuote(`%${cleanSearch}%`)},tracking_number.ilike.${orQuote(`%${cleanSearch}%`)}`);
        }
      }

      // Fetch ALL matching (limit to 5000 for safety)
      const { data: allOrders, error } = await query.order("ordered_at", { ascending: false }).limit(5000);

      if (error) throw error;
      if (!allOrders || allOrders.length === 0) {
        toast.error("No data found for current filters", { id: toastId });
        return;
      }

      // 2. CSV Formatting Helper
      const formatCSVValue = (val: any) => {
        if (val === null || val === undefined) return "";
        const str = String(val).replace(/"/g, '""'); // Escape quotes
        return str.includes(",") || str.includes("\n") || str.includes('"') ? `"${str}"` : str;
      };

      // 3. Transform Data
      const headers = [
        "Order #", 
        "Customer Name", 
        "Customer Phone", 
        "Delivery Status", 
        "Fulfillment", 
        "Amount (INR)", 
        "Ordered At", 
        "Items", 
        "Qty", 
        "Tracking #", 
        "Source"
      ];

      const rows = allOrders.map(o => {
        const itemsSummary = (o.line_items || []).map((l: any) => `${l.title || l.name}${l.quantity > 1 ? ` (x${l.quantity})` : ""}`).join("; ");
        const totalQty = (o.line_items || []).reduce((acc: number, l: any) => acc + (l.quantity || 1), 0);

        return [
          o.order_number,
          o.customer?.name || "Unknown",
          o.customer?.phone || "N/A",
          o.delivery_status || "pending",
          o.fulfillment_status || "unfulfilled",
          o.total_price,
          o.ordered_at ? new Date(o.ordered_at).toLocaleString() : "N/A",
          itemsSummary,
          totalQty,
          o.tracking_number || "-",
          o.source || "Shopify"
        ].map(formatCSVValue);
      });

      // 4. Generate & Download
      const csvContent = [
        headers.join(","),
        ...rows.map(r => r.join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `orders_full_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(`Exported ${allOrders.length} orders successfully!`, { id: toastId });
    } catch (err: any) {
      console.error("Export Error:", err);
      toast.error(`Export failed: ${err.message}`, { id: toastId });
    } finally {
      setIsExporting(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }

  function toggleSelectAll() {
    if (selectedIds.length === orders.length) setSelectedIds([]);
    else setSelectedIds(orders.map(o => o.id));
  }

  async function handleBulkDelete() {
    const isDemo = isDemoMode();
    if (isDemo) {
      toast.success(`Demo: Deleted ${selectedIds.length} orders (local only)`);
      setOrders(prev => prev.filter(o => !selectedIds.includes(o.id)));
      setSelectedIds([]);
      setDeleteModal(false);
      return;
    }
    setIsDeleting(true);
    const { error } = await supabase.from("orders").delete().in("id", selectedIds);
    
    if (error) {
      toast.error("Failed to delete orders");
    } else {
      await logAuditEvent({
        entityType: "order",
        action: "bulk_delete",
        summary: `Deleted ${selectedIds.length} orders`,
        metadata: { ids: selectedIds },
      });
      toast.success(`${selectedIds.length} orders deleted`);
      fetchOrders();
      setDeleteModal(false);
    }
    setIsDeleting(false);
  }

  const canDelete = hasPermission(profile, "can_delete");

  return (
    <div className="animate-fade-in">
      <PageHeader title="Orders" subtitle={`${totalMatching.toLocaleString()} matching orders`} 
        actions={
          <div className="flex items-center gap-2">
            <button 
              onClick={handleExportCsv} 
              disabled={isExporting}
              className={cn(
                "btn-secondary flex items-center gap-1.5 py-1.5 px-3",
                isExporting && "opacity-70 cursor-wait"
              )}
            >
              {isExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {isExporting ? "Exporting..." : "Export"}
            </button>

            <button 
              onClick={handleShiprocketSync} 
              disabled={syncing}
              className={cn(
                "btn-primary flex items-center gap-1.5 py-1.5 px-3 relative overflow-hidden",
                syncing && "opacity-80 cursor-not-allowed"
              )}
            >
              {syncing && <div className="absolute inset-0 bg-white/20 animate-shimmer" />}
              <RefreshCw className={cn("w-3.5 h-3.5", (syncing || loading) && "animate-spin")} />
              {syncing ? "Syncing API..." : "Sync Shiprocket"}
            </button>
          </div>
        }
      />

      {/* Advanced Filter Panel - Persistent */}
      <div className="card p-4 mb-5 animate-fade-in overflow-visible z-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-[9px] md:text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest block mb-1 md:mb-1.5 opacity-60">Date From</label>
            <input type="date" className="input text-xs h-9 bg-[#fcfbf8]" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="text-[9px] md:text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest block mb-1 md:mb-1.5 opacity-60">Date To</label>
            <input type="date" className="input text-xs h-9 bg-[#fcfbf8]" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div>
            <label className="text-[9px] md:text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest block mb-1 md:mb-1.5 opacity-60">Min Amount (₹)</label>
            <input type="number" placeholder="0" className="input text-xs h-9 bg-[#fcfbf8]" value={minAmount} onChange={e => setMinAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-[9px] md:text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest block mb-1 md:mb-1.5 opacity-60">Max Amount (₹)</label>
            <input type="number" placeholder="99999" className="input text-xs h-9 bg-[#fcfbf8]" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end mt-4 pt-4 border-t border-[#eceae4] items-center gap-4">
          <button 
            onClick={() => {
              setStartDate("");
              setEndDate("");
              setMinAmount("");
              setMaxAmount("");
              setStatus("all");
            }}
            className="text-[10px] text-rose-500 font-bold uppercase tracking-widest hover:underline"
          >
            Clear Filters
          </button>
          <div className="text-[10px] text-[#5f5f5d] font-bold uppercase tracking-widest opacity-40">Live Sync Active</div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1 w-full md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#5f5f5d]" />
          <input placeholder="Search orders or tracking..." className="input pl-9 text-xs" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-1 bg-[#eceae4]/30 rounded-xl border border-[#eceae4] p-1 overflow-x-auto scroller-hide">
          {STATUSES.map(s => (
            <button key={s.value} onClick={() => setStatus(s.value)}
              className={cn("px-4 md:px-5 py-2 rounded-lg text-[9px] md:text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap",
                status === s.value ? "bg-[#1c1c1c] text-white shadow-md" : "text-[#5f5f5d] hover:bg-[#eceae4]/50"
              )}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-10">
        {[
          { label: "Delivered", value: "delivered", count: stats.delivered, color: "border-l-[#1c1c1c]", active: "shadow-xl border-[#1c1c1c]" },
          { label: "Transit", value: "in_transit", count: stats.in_transit, color: "border-l-[#eceae4]", active: "shadow-xl border-[#1c1c1c]" },
          { label: "Out for Delivery", value: "out_for_delivery", count: stats.out_for_delivery, color: "border-l-sky-500", active: "shadow-xl border-[#1c1c1c]" },
          { label: "RTO", value: "rto", count: stats.rto, color: "border-l-rose-500", active: "shadow-xl border-[#1c1c1c]" },
          { label: "Pending", value: "pending", count: stats.pending, color: "border-l-amber-500", active: "shadow-xl border-[#1c1c1c]" },
          { label: "Failed", value: "failed", count: stats.failed, color: "border-l-red-700", active: "shadow-xl border-[#1c1c1c]" },
        ].map(s => (
          <button 
            key={s.label} 
            onClick={() => setStatus(status === s.value ? "all" : s.value)}
            className={cn(
              "card p-4 md:p-6 border-l-4 text-left transition-all duration-300 relative group overflow-hidden hover:translate-y-[-2px]", 
              s.color,
              status === s.value ? s.active : ""
            )}
          >
            {status === s.value && (
               <div className="absolute top-2 right-2 md:top-3 md:right-3 w-1.5 h-1.5 rounded-full bg-[#1c1c1c] animate-pulse" />
            )}
            <div className="text-xl md:text-3xl font-bold text-[#1c1c1c] tracking-tighter mb-1 md:mb-2">{s.count}</div>
            <div className="text-[9px] md:text-[10px] text-[#5f5f5d] font-bold uppercase tracking-widest">{s.label}</div>
          </button>
        ))}
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto scrollbar-hide">
          <div className="min-w-[1000px]">
            <div className="grid grid-cols-[40px_100px_2fr_2fr_1.5fr_1fr_1fr_1fr_120px] bg-[#eceae4]/30 border-b border-[#eceae4] px-4 py-3 text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">
              <div className="flex items-center justify-center">
                <input type="checkbox" className="checkbox w-3.5 h-3.5" 
                  checked={selectedIds.length === orders.length && orders.length > 0} 
                  onChange={toggleSelectAll} 
                />
              </div>
              <span>ID</span>
              <span>Client</span>
              <span>Items</span>
              <span>Status</span>
              <span>Value</span>
              <span className="text-right pr-4">Created</span>
              <span className="text-right pr-4">Delivery</span>
              <span>Actions</span>
            </div>
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Loading orders...</div>
        ) : orders.length === 0 ? (
          <EmptyState icon={<Package className="w-5 h-5" />} title="No orders found" />
        ) : (
          <div className="min-h-[400px]">
            {orders.map((o) => (
              <div key={o.id} className={cn(
                "grid grid-cols-[40px_100px_2fr_2fr_1.5fr_1fr_1fr_1fr_120px] px-4 py-4 border-b border-[#eceae4]/50 group transition-colors",
                selectedIds.includes(o.id) ? "bg-[#eceae4]/40" : "hover:bg-[rgba(28,28,28,0.02)]"
              )}>
                <div className="flex items-center justify-center">
                  <input type="checkbox" className="checkbox w-3.5 h-3.5" 
                    checked={selectedIds.includes(o.id)} 
                    onChange={() => toggleSelect(o.id)} 
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => setSelectedOrderId(o.id)}
                    title={`#${o.order_number}`}
                    className="text-xs font-bold text-[#1c1c1c] hover:underline truncate"
                  >
                    #{o.order_number}
                  </button>
                </div>
                <Link 
                  href={`/customers/${o.customer_id}`} 
                  onClick={(e) => e.stopPropagation()} 
                  className="flex items-center gap-2 min-w-0"
                >
                  {o.customer && <Avatar name={o.customer.name} size="sm" />}
                  <div className="text-xs font-bold text-[#1c1c1c] truncate hover:underline">{o.customer?.name}</div>
                </Link>
                  <div className="flex items-center text-[11px] text-[#5f5f5d] font-bold truncate opacity-60">{o.line_items.map(l => l.name || l.title || "Unknown").join(", ")}</div>
                <div className="flex items-center gap-1.5">
                  <DeliveryBadge status={o.delivery_status} />
                  <RiskBadge level={o.custom_meta?.risk_analysis?.level} />
                </div>
                <span className="flex items-center text-xs font-bold text-[#1c1c1c]">{formatCurrency(o.total_price ?? 0)}</span>
                <span className="flex items-center text-[10px] text-[#5f5f5d] font-bold">{formatDate(o.ordered_at)}</span>
                <span className="flex items-center text-[10px] text-[#5f5f5d] font-bold">{o.delivered_at ? formatDate(o.delivered_at) : "—"}</span>
                <div className="flex items-center gap-1.5">
                  {o.customer?.phone && (
                    <Link 
                      href={`https://wa.me/${o.customer.phone.replace(/\D/g, '')}?text=Hi ${o.customer.name}, regarding your order ${o.order_number}...`}
                      target="_blank"
                      className="w-7 h-7 rounded-lg bg-[#eceae4] text-[#1c1c1c] flex items-center justify-center hover:bg-[#1c1c1c] hover:text-white transition-all shadow-sm"
                      title="WhatsApp"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </Link>
                  )}
                  {o.tracking_number && (
                    <Link 
                      href={`https://shiprocket.co/tracking/${o.tracking_number}`}
                      target="_blank"
                      className="w-7 h-7 rounded-lg bg-[#eceae4] text-[#1c1c1c] flex items-center justify-center hover:bg-[#1c1c1c] hover:text-white transition-all shadow-sm"
                      title="Track"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    <Pagination 
      current={page} 
      total={totalMatching} 
      pageSize={pageSize} 
      onChange={(p) => { setPage(p); window.scrollTo(0, 0); }} 
    />
  </div>

      <Modal 
        open={!!selectedOrderId} 
        onClose={() => setSelectedOrderId(null)} 
        title="Order Tracking Details"
        maxWidth="max-w-4xl"
      >
        {selectedOrderId && <ShiprocketOrderView orderId={selectedOrderId} />}
      </Modal>

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Confirm Bulk Deletion"
        footer={<>
          <button className="btn-secondary" onClick={() => setDeleteModal(false)}>Cancel</button>
          <button className="btn-danger" onClick={handleBulkDelete} disabled={isDeleting || !canDelete}>
            {isDeleting ? "Deleting..." : "Delete Permanently"}
          </button>
        </>}
      >
        <p className="text-sm text-gray-600">
          Are you sure you want to delete <strong>{selectedIds.length}</strong> selected orders? This action is irreversible and will also delete all associated tasks.
        </p>
      </Modal>

      {/* Floating Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-[calc(50%+2rem)] lg:left-1/2 -translate-x-1/2 z-40 animate-slide-up w-[calc(100%-6rem)] md:w-auto">
          <div className="bg-[#1c1c1c] text-white flex items-center gap-4 md:gap-6 px-4 md:px-6 py-3 rounded-2xl shadow-2xl min-w-0 md:min-w-[450px]">
            <div className="flex items-center gap-2 md:gap-3 border-r border-white/10 pr-4 md:pr-6">
              <div className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-[#f7f4ed] text-[#1c1c1c] flex items-center justify-center text-[9px] md:text-[10px] font-bold">
                {selectedIds.length}
              </div>
              <span className="hidden xs:inline text-[9px] md:text-[10px] font-bold uppercase tracking-widest opacity-60">Selection</span>
            </div>
            
            <div className="flex items-center gap-3 flex-1">
              <button 
                onClick={handleExportCsv}
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest hover:text-[#eceae4] transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
              
              {canDelete && (
                <button 
                  onClick={() => setDeleteModal(true)}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-rose-400 hover:text-rose-300 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              )}
            </div>
            
            <button 
              onClick={() => setSelectedIds([])}
              className="w-6 h-6 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/40"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
