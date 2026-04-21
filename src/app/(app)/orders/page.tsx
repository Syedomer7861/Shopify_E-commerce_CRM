"use client";
import { useState, useEffect } from "react";
import { Search, Package, RefreshCw, Trash2, Download, MessageSquare, ExternalLink, Filter } from "lucide-react";
import Link from "next/link";
import { PageHeader, DeliveryBadge, Avatar, EmptyState, Modal } from "@/components/ui";
import ShiprocketOrderView from "@/components/ShiprocketOrderView";
import { createClient } from "@/lib/supabase";
import { cn, formatDate, formatCurrency } from "@/lib/utils";
import type { Order, DeliveryStatus, Customer } from "@/types";
import toast from "react-hot-toast";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";

const STATUSES: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Delivered", value: "delivered" },
  { label: "In Transit", value: "in_transit" },
  { label: "RTO", value: "rto" },
  { label: "Pending", value: "pending" },
];

export default function OrdersPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<(Order & { customer: Customer })[]>([]);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState({ delivered: 0, in_transit: 0, rto: 0, pending: 0 });
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

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalMatching, setTotalMatching] = useState(0);

  const supabase = createClient();

  useEffect(() => {
    // Initial fetch
    fetchOrders();
  }, [page, status, search, startDate, endDate, minAmount, maxAmount]);

  // Reset to page 1 on filter change
  useEffect(() => {
    setPage(1);
  }, [status, search, startDate, endDate, minAmount, maxAmount]);

  useEffect(() => {
    const interval = setInterval(() => {
      // In background, we fetch without resetting anything
      fetchOrders(true);
    }, 30000);

    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders(true);
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [page, status, search, startDate, endDate, minAmount, maxAmount]); // Re-subscribe when any parameter changes to avoid stale closures

  async function fetchOrders(isSilent = false) {
    if (orders.length === 0 && !isSilent) setLoading(true);
    
    // Helper to apply advanced filters once to any query
    const applyAdvancedFilters = (q: any) => {
      if (startDate) q = q.gte("ordered_at", `${startDate}T00:00:00Z`);
      if (endDate) q = q.lte("ordered_at", `${endDate}T23:59:59Z`);
      if (minAmount) q = q.gte("total_price", parseFloat(minAmount));
      if (maxAmount) q = q.lte("total_price", parseFloat(maxAmount));
      return q;
    };

    let query = supabase.from("orders").select("*, customer:customers!inner(*)", { count: "exact" });
    query = applyAdvancedFilters(query);

    if (status !== "all") {
      query = query.eq("delivery_status", status);
    }

    if (search) {
      const cleanSearch = search.trim().replace(/^#/, "");
      const isPhone = /^\d{7,15}$/.test(cleanSearch.replace(/\s/g, ""));

      let customerQuery = supabase.from("customers").select("id");
      if (isPhone) {
        customerQuery = customerQuery.or(`phone.eq.${cleanSearch},phone.ilike.%${cleanSearch}%`);
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

    const [d, t, r, p] = await Promise.all([
      countQuery("delivered"),
      countQuery("in_transit"),
      countQuery("rto"),
      countQuery("pending"),
    ]);

    setOrders((ordersData || []) as any);
    setStats({
      delivered: d.count || 0,
      in_transit: t.count || 0,
      rto: r.count || 0,
      pending: p.count || 0,
    });
    setLoading(false);
  }

  async function handleShiprocketSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/shiprocket", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(`Shiprocket Sync Complete! Updated ${data.report.orders_processed} tracking statuses.`);
      } else throw new Error(data.error);
    } catch (err: any) {
      toast.error("Shiprocket Sync Failed: " + err.message);
    } finally {
      await fetchOrders();
      setSyncing(false);
    }
  }


  async function handleGlobalSync() {
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
          customerQuery = customerQuery.or(`phone.eq.${cleanSearch},phone.ilike.%${cleanSearch}%`);
        } else {
          customerQuery = customerQuery.ilike("name", `%${cleanSearch}%`);
        }

        const { data: customers } = await customerQuery;
        const customerIds = customers?.map(c => c.id) || [];

        if (customerIds.length > 0) {
          query = query.or(`order_number.ilike.%${cleanSearch}%,tracking_number.ilike.%${cleanSearch}%,customer_id.in.(${customerIds.join(",")})`);
        } else {
          query = query.or(`order_number.ilike.%${cleanSearch}%,tracking_number.ilike.%${cleanSearch}%`);
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
      <div className="card p-4 mb-5 border-[#2D1E6F]/10 bg-white shadow-lg overflow-visible z-10 animate-fade-in">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Order Date From</label>
            <input type="date" className="input text-xs h-9" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Order Date To</label>
            <input type="date" className="input text-xs h-9" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Min Amount (₹)</label>
            <input type="number" placeholder="0" className="input text-xs h-9" value={minAmount} onChange={e => setMinAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Max Amount (₹)</label>
            <input type="number" placeholder="99999" className="input text-xs h-9" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end mt-3 pt-3 border-t border-gray-100 items-center gap-4">
          <button 
            onClick={() => {
              setStartDate("");
              setEndDate("");
              setMinAmount("");
              setMaxAmount("");
              setStatus("all");
            }}
            className="text-[11px] text-rose-500 font-bold hover:underline"
          >
            Reset All
          </button>
          <div className="text-[10px] text-gray-400 italic">Filters auto-apply on change</div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input placeholder="Search by order or tracking..." className="input pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1 overflow-x-auto scroller-hide">
          {STATUSES.map(s => (
            <button key={s.value} onClick={() => setStatus(s.value)}
              className={cn("px-4 py-2 rounded-md text-xs font-bold transition-all whitespace-nowrap",
                status === s.value ? "bg-[#2D1E6F] text-white shadow-sm" : "text-gray-500 hover:text-[#2D1E6F]"
              )}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Delivered", value: "delivered", count: stats.delivered, color: "border-l-blue-600", active: "ring-2 ring-blue-400" },
          { label: "In Transit", value: "in_transit", count: stats.in_transit, color: "border-l-blue-500", active: "ring-2 ring-blue-400" },
          { label: "RTO", value: "rto", count: stats.rto, color: "border-l-rose-500", active: "ring-2 ring-rose-400" },
          { label: "Pending", value: "pending", count: stats.pending, color: "border-l-gray-400", active: "ring-2 ring-[#2D1E6F]/20" },
        ].map(s => (
          <button 
            key={s.label} 
            onClick={() => setStatus(status === s.value ? "all" : s.value)}
            className={cn(
              "stat-card p-5 border-l-4 text-left transition-all duration-300 relative group overflow-hidden", 
              s.color,
              status === s.value ? s.active : "bg-white/80"
            )}
          >
            {status === s.value && (
               <div className="absolute top-0 right-0 p-2">
                 <div className="w-2 h-2 rounded-full bg-[#2D1E6F] animate-pulse" />
               </div>
            )}
            <div className="text-3xl font-black text-[#2D1E6F] font-display leading-none mb-1">{s.count}</div>
            <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{s.label}</div>
          </button>
        ))}
      </div>

      <div className="table-container">
        <div className="grid grid-cols-[40px_100px_2fr_2fr_1.5fr_1fr_1fr_1fr_120px] table-header text-[11px]">
          <div className="flex items-center justify-center">
            <input type="checkbox" className="checkbox w-4 h-4" 
              checked={selectedIds.length === orders.length && orders.length > 0} 
              onChange={toggleSelectAll} 
            />
          </div>
          <span className="font-black">ORDER #</span>
          <span className="font-black">CUSTOMER</span>
          <span className="font-black">PRODUCT</span>
          <span className="font-black">STATUS</span>
          <span className="font-black">AMOUNT</span>
          <span className="font-black text-right pr-4">ORDERED</span>
          <span className="font-black text-right pr-4">DELIVERED</span>
          <span className="font-black">ACTIONS</span>
        </div>
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Loading orders...</div>
        ) : orders.length === 0 ? (
          <EmptyState icon={<Package className="w-5 h-5" />} title="No orders found" />
        ) : (
          <>
            <div className="min-h-[400px]">
              {orders.map((o) => (
                <div key={o.id} className={cn(
                  "table-row grid grid-cols-[40px_100px_2fr_2fr_1.5fr_1fr_1fr_1fr_120px] group",
                  selectedIds.includes(o.id) && "bg-[#2D1E6F]/5"
                )}>
                  <div className="flex items-center justify-center">
                    <input type="checkbox" className="checkbox w-4 h-4" 
                      checked={selectedIds.includes(o.id)} 
                      onChange={() => toggleSelect(o.id)} 
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-sky-50 flex items-center justify-center p-1" title="Shopify Channel">
                      <svg viewBox="0 0 24 24" className="w-full h-full text-sky-600 fill-current">
                        <path d="M18.8 11.2C18.6 11 18.3 10.9 18 10.9H17.4C17.1 10.9 16.8 11 16.6 11.2L15.3 12.5C15.1 12.7 14.8 12.8 14.5 12.8H13.6L12 11.2L13.6 9.6H14.5C14.8 9.6 15.1 9.7 15.3 9.9L16.6 11.2C16.8 11.4 17.1 11.5 17.4 11.5H18C18.3 11.5 18.6 11.4 18.8 11.2L20.1 9.9C20.3 9.7 20.4 9.4 20.4 9.1C20.4 8.8 20.3 8.5 20.1 8.3L15.7 3.9C15.5 3.7 15.2 3.6 14.9 3.6C14.6 3.6 14.3 3.7 14.1 3.9L12.8 5.2C12.6 5.4 12.3 5.5 12 5.5C11.7 5.5 11.4 5.4 11.2 5.2L9.9 3.9C9.7 3.7 9.4 3.6 9.1 3.6C8.8 3.6 8.5 3.7 8.3 3.9L3.9 8.3C3.7 8.5 3.6 8.8 3.6 9.1C3.6 9.4 3.7 9.7 3.9 9.9L5.2 11.2C5.4 11.4 11.5 11.5 11.5H6C5.7 11.5 5.4 11.4 5.2 11.2L3.9 9.9C3.7 9.7 3.4 9.6 3.1 9.6C2.8 9.6 2.5 9.7 2.3 9.9L0.9 11.2C0.7 11.4 0.6 11.7 0.6 12C0.6 12.3 0.7 12.6 0.9 12.8L2.3 14.1C2.5 14.3 2.8 14.4 3.1 14.4C3.4 14.4 3.7 14.3 3.9 14.1L5.2 12.8C5.4 12.6 5.7 12.5 6 12.5H6.9L8.5 14.1L6.9 15.7H6C5.7 15.7 5.4 15.6 5.2 15.4L3.9 14.1C3.7 13.9 3.4 13.8 3.1 13.8C2.8 13.8 2.5 13.9 2.3 14.1L0.9 15.4C0.7 15.6 0.6 15.9 0.6 16.2C0.6 16.5 0.7 16.8 0.9 17L5.3 21.4C5.5 21.6 5.8 21.7 6.1 21.7C6.4 21.7 6.7 21.6 6.9 21.4L8.2 20.1C8.4 19.9 8.7 19.8 9 19.8C9.3 19.8 9.6 19.9 9.8 20.1L11.1 21.4C11.3 21.6 11.6 21.7 11.9 21.7C12.2 21.7 12.5 21.6 12.7 21.4L17.1 17C17.3 16.8 17.4 16.5 17.4 16.2C17.4 15.9 17.3 15.6 17.1 15.4L15.8 14.1C15.6 13.9 15.3 13.8 15 13.8H14.1C13.8 13.8 13.5 13.9 13.3 14.1L12 15.4L10.4 13.8H11.3C11.6 13.8 11.9 13.7 12.1 13.5L13.4 12.2C13.6 12 13.9 11.9 14.2 11.9H14.8C15.1 11.9 15.4 12 15.6 12.2L16.9 13.5C17.1 13.7 17.4 13.8 17.7 13.8H18.3C18.6 13.8 18.9 13.7 19.1 13.5L20.5 12.2C20.7 12 20.8 11.7 20.8 11.4C20.8 11.1 20.7 10.8 20.5 10.6L18.8 11.2Z"/>
                      </svg>
                    </div>
                    <button 
                      onClick={() => setSelectedOrderId(o.id)}
                      className="text-xs font-black text-[#2D1E6F] hover:underline transition-all"
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
                    <div className="text-xs font-bold text-[#2D1E6F] truncate hover:underline">{o.customer?.name}</div>
                  </Link>
                  <div className="flex items-center text-[11px] text-gray-500 truncate group-hover:text-gray-700">{o.line_items.map(l => l.name || l.title || "Unknown Product").join(", ")}</div>
                  <div className="flex items-center"><DeliveryBadge status={o.delivery_status} /></div>
                  <span className="flex items-center text-sm font-black text-[#2D1E6F] font-display">{formatCurrency(o.total_price ?? 0)}</span>
                  <span className="flex items-center text-xs text-gray-400 font-medium">{formatDate(o.ordered_at)}</span>
                  <span className="flex items-center text-xs text-gray-400 font-medium">{o.delivered_at ? formatDate(o.delivered_at) : "—"}</span>
                  <div className="flex items-center gap-1.5">
                    {o.customer?.phone && (
                      <Link 
                        href={`https://wa.me/${o.customer.phone.replace(/\D/g, '')}?text=Hi ${o.customer.name}, regarding your order ${o.order_number}...`}
                        target="_blank"
                        className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-500 hover:text-white transition-all shadow-sm"
                        title="WhatsApp Customer"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </Link>
                    )}
                    {o.tracking_number && (
                      <Link 
                        href={`https://shiprocket.co/tracking/${o.tracking_number}`}
                        target="_blank"
                        className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center hover:bg-sky-500 hover:text-white transition-all shadow-sm"
                        title="Track Externally"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {totalMatching > pageSize && (
              <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                <div className="text-xs text-gray-500 font-medium font-display">
                  Showing <span className="font-extrabold text-[#2D1E6F]">{(page - 1) * pageSize + 1}</span> to <span className="font-extrabold text-[#2D1E6F]">{Math.min(page * pageSize, totalMatching)}</span> of <span className="font-extrabold text-[#2D1E6F]">{totalMatching.toLocaleString()}</span> orders
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="w-10 h-10 flex items-center justify-center bg-white border border-gray-200 rounded-xl hover:bg-[#2D1E6F] hover:text-white disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-gray-400 transition-all active:scale-90 shadow-sm"
                    >
                      ←
                    </button>
                    
                    <div className="flex items-center gap-1 px-2">
                       {(() => {
                         const totalPages = Math.ceil(totalMatching / pageSize);
                         const maxButtons = 5;
                         let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
                         let endPage = Math.min(totalPages, startPage + maxButtons - 1);
                         
                         if (endPage - startPage + 1 < maxButtons) {
                           startPage = Math.max(1, endPage - maxButtons + 1);
                         }

                         const pages = [];
                         for (let i = startPage; i <= endPage; i++) {
                           pages.push(i);
                         }

                         return (
                           <>
                             {startPage > 1 && (
                               <>
                                 <button onClick={() => setPage(1)} className="w-10 h-10 rounded-xl text-xs font-black bg-white text-gray-500 border border-gray-200 hover:bg-[#2D1E6F] hover:text-white transition-all">1</button>
                                 {startPage > 2 && <span className="text-gray-400 px-1 text-xs">...</span>}
                               </>
                             )}
                             {pages.map(p => (
                               <button
                                 key={p}
                                 onClick={() => setPage(p)}
                                 className={cn(
                                   "w-10 h-10 rounded-xl text-xs font-black transition-all active:scale-95 shadow-sm",
                                   page === p ? "bg-[#2D1E6F] text-white" : "bg-white text-gray-500 hover:bg-gray-50 border border-gray-200"
                                 )}
                               >
                                 {p}
                               </button>
                             ))}
                             {endPage < totalPages && (
                               <>
                                 {endPage < totalPages - 1 && <span className="text-gray-400 px-1 text-xs">...</span>}
                                 <button onClick={() => setPage(totalPages)} className="w-10 h-10 rounded-xl text-xs font-black bg-white text-gray-500 border border-gray-200 hover:bg-[#2D1E6F] hover:text-white transition-all">{totalPages}</button>
                               </>
                             )}
                           </>
                         );
                       })()}
                    </div>

                    <button
                      onClick={() => setPage(p => p + 1)}
                      disabled={page >= Math.ceil(totalMatching / pageSize)}
                      className="w-10 h-10 flex items-center justify-center bg-white border border-gray-200 rounded-xl hover:bg-[#2D1E6F] hover:text-white disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-gray-400 transition-all active:scale-90 shadow-sm"
                    >
                      →
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slide-up">
          <div className="glass-card flex items-center gap-4 px-6 py-4 rounded-2xl border-[#2D1E6F]/10 shadow-2xl min-w-[400px]">
            <div className="flex items-center gap-2 border-r border-gray-200 pr-4">
              <div className="w-8 h-8 rounded-full bg-[#2D1E6F] text-white flex items-center justify-center text-xs font-black">
                {selectedIds.length}
              </div>
              <span className="text-xs font-black text-[#2D1E6F] uppercase tracking-tight">Active Selection</span>
            </div>
            
            <div className="flex items-center gap-2 flex-1">
              <button 
                onClick={handleExportCsv}
                className="btn-secondary h-10 px-4 rounded-xl flex items-center gap-2 border-[#2D1E6F]/10"
              >
                <Download className="w-4 h-4" />
                <span className="text-xs font-bold font-display">Export Selected</span>
              </button>
              
              {canDelete && (
                <button 
                  onClick={() => setDeleteModal(true)}
                  className="btn-danger h-10 px-4 rounded-xl flex items-center gap-2 border-rose-100"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="text-xs font-bold font-display">Delete All</span>
                </button>
              )}
            </div>
            
            <button 
              onClick={() => setSelectedIds([])}
              className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
