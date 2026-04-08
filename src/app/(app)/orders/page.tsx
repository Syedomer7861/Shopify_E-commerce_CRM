"use client";
import { useState, useEffect } from "react";
import { Search, Package, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { PageHeader, DeliveryBadge, Avatar, EmptyState, Modal } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn, formatDate, formatCurrency } from "@/lib/utils";
import type { Order, DeliveryStatus, Customer } from "@/types";
import toast from "react-hot-toast";

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
  const [isDeleting, setIsDeleting] = useState(false);

  const [syncing, setSyncing] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    fetchOrders();

    // 30-SECOND REFRESH: A slower background poll for safety.
    // Real-time subscriptions below will handle the instant updates.
    const interval = setInterval(fetchOrders, 30000);

    // REAL-TIME UPDATES: This is the 'quiet' way to stay live.
    // It only triggers when an actual change happens in the database.
    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders(true))
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [status, search]);

  async function fetchOrders(isSilent = false) {
    // Only show loading on the very first load or if NOT silent
    if (orders.length === 0 && !isSilent) setLoading(true);
    
    // Use !inner join to allow filtering by customer fields
    let query = supabase.from("orders").select("*, customer:customers!inner(*)");

    if (status !== "all") {
      query = query.eq("delivery_status", status);
    }

    if (search) {
      // Search by order info OR customer info
      query = query.or(`order_number.ilike.%${search}%,tracking_number.ilike.%${search}%,name.ilike.%${search}%`, { foreignTable: "customer" });
    }

    const { data: ordersData } = await query.order("ordered_at", { ascending: false });

    // Fetch stats
    const { data: statusStats } = await supabase
      .from("orders")
      .select("delivery_status");
    
    const s = { delivered: 0, in_transit: 0, rto: 0, pending: 0 };
    statusStats?.forEach(o => {
      if (o.delivery_status === "delivered") s.delivered++;
      if (o.delivery_status === "in_transit") s.in_transit++;
      if (o.delivery_status === "rto") s.rto++;
      if (o.delivery_status === "pending") s.pending++;
    });

    setOrders((ordersData || []) as any);
    setStats(s);
    setLoading(false);
    // REMOVED: setSelectedIds([]); - This allows selection to persist during sync
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

  async function handleShopifySync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/shopify", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(`Shopify Sync Complete! Pulled ${data.report.orders_processed} orders with full data.`);
      } else throw new Error(data.error);
    } catch (err: any) {
      toast.error("Shopify Sync Failed: " + err.message);
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
      toast.success(`${selectedIds.length} orders deleted`);
      fetchOrders();
      setDeleteModal(false);
    }
    setIsDeleting(false);
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Orders" subtitle={`${orders.length} matching orders`} 
        actions={
          <div className="flex items-center gap-2">
            <button 
              onClick={handleShopifySync} 
              disabled={syncing}
              className={cn(
                "bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 py-1.5 px-3 font-bold text-xs transition-all shadow-sm",
                syncing && "opacity-50 cursor-not-allowed"
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
              Sync Shopify
            </button>

            <button 
              onClick={handleShiprocketSync} 
              disabled={syncing}
              className={cn(
                "btn-primary flex items-center gap-1.5 py-1.5 px-3",
                syncing && "opacity-50 cursor-not-allowed"
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", (syncing || loading) && "animate-spin")} />
              {syncing ? "Syncing..." : "Sync Shiprocket"}
            </button>

            {selectedIds.length > 0 && (
              <button onClick={() => setDeleteModal(true)} className="btn-danger">
                <Trash2 className="w-4 h-4" /> Delete ({selectedIds.length})
              </button>
            )}
          </div>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input placeholder="Search by order or tracking..." className="input pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1 overflow-x-auto scroller-hide">
          {STATUSES.map(s => (
            <button key={s.value} onClick={() => setStatus(s.value)}
              className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                status === s.value ? "bg-forest text-lime shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Delivered", count: stats.delivered, color: "border-l-emerald-500" },
          { label: "In Transit", count: stats.in_transit, color: "border-l-blue-500" },
          { label: "RTO", count: stats.rto, color: "border-l-rose-500" },
          { label: "Pending", count: stats.pending, color: "border-l-gray-400" },
        ].map(s => (
          <div key={s.label} className={cn("card p-3 border-l-4", s.color)}>
            <div className="text-xl font-bold text-forest">{s.count}</div>
            <div className="text-xs text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="table-container">
        <div className="grid grid-cols-[40px_80px_2fr_2fr_1.5fr_1fr_1fr_1fr] table-header text-[11px]">
          <div className="flex items-center justify-center">
            <input type="checkbox" className="checkbox w-4 h-4" 
              checked={selectedIds.length === orders.length && orders.length > 0} 
              onChange={toggleSelectAll} 
            />
          </div>
          <span>Order #</span><span>Customer</span><span>Product</span>
          <span>Status</span><span>Amount</span><span>Ordered</span><span>Delivered</span>
        </div>
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Loading orders...</div>
        ) : orders.length === 0 ? (
          <EmptyState icon={<Package className="w-5 h-5" />} title="No orders found" />
        ) : (
          orders.map(o => (
            <div key={o.id} className={cn("table-row grid grid-cols-[40px_80px_2fr_2fr_1.5fr_1fr_1fr_1fr]", selectedIds.includes(o.id) && "bg-forest/5")}>
              <div className="flex items-center justify-center">
                <input type="checkbox" className="checkbox w-4 h-4" 
                  checked={selectedIds.includes(o.id)} 
                  onChange={() => toggleSelect(o.id)} 
                />
              </div>
              <span className="text-xs font-semibold text-forest flex items-center">{o.order_number}</span>
              <Link 
                href={`/customers/${o.customer_id}`} 
                onClick={(e) => e.stopPropagation()} 
                className="flex items-center gap-2 min-w-0"
              >
                {o.customer && <Avatar name={o.customer.name} size="sm" />}
                <div className="text-xs font-medium text-forest truncate hover:underline">{o.customer?.name}</div>
              </Link>
              <div className="flex items-center text-xs text-gray-600 truncate">{o.line_items.map(l => l.name || l.title || "Unknown Product").join(", ")}</div>
              <div className="flex items-center"><DeliveryBadge status={o.delivery_status} /></div>
              <span className="flex items-center text-sm font-semibold text-forest">{formatCurrency(o.total_price ?? 0)}</span>
              <span className="flex items-center text-xs text-gray-500">{formatDate(o.ordered_at)}</span>
              <span className="flex items-center text-xs text-gray-500">{o.delivered_at ? formatDate(o.delivered_at) : "—"}</span>
            </div>
          ))
        )}
      </div>
      <div className="text-xs text-gray-400 mt-3 text-right">Showing {orders.length} orders</div>

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Confirm Bulk Deletion"
        footer={<>
          <button className="btn-secondary" onClick={() => setDeleteModal(false)}>Cancel</button>
          <button className="btn-danger" onClick={handleBulkDelete} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete Permanently"}
          </button>
        </>}
      >
        <p className="text-sm text-gray-600">
          Are you sure you want to delete <strong>{selectedIds.length}</strong> selected orders? This action is irreversible and will also delete all associated tasks.
        </p>
      </Modal>
    </div>
  );
}
