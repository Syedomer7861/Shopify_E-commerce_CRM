"use client";
import { useState, useEffect, useCallback } from "react";


import { Search, UserPlus, Phone, AlertTriangle, RefreshCw, Trash2, CheckCircle, X, Filter } from "lucide-react";
import Link from "next/link";
import { PageHeader, SegmentBadge, Avatar, EmptyState, Modal, Pagination } from "@/components/ui";
import dynamic from 'next/dynamic';
const AddCustomerModal = dynamic(() => import("@/components/AddCustomerModal").then(mod => mod.AddCustomerModal), { 
  loading: () => <div className="p-8 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto text-gray-300" /></div>
});
import { createClient } from "@/lib/supabase";
import { cn, formatDate } from "@/lib/utils";
import type { Customer, CustomerSegment } from "@/types";
import toast from "react-hot-toast";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";

const SEGS: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Repeat", value: "repeat" },
  { label: "One-time", value: "one_time" },
  { label: "Inactive", value: "inactive" },
  { label: "RTO Flagged", value: "rto" },
];

export default function CustomersPage() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [seg, setSeg] = useState("all");
  const [stats, setStats] = useState({ repeat: 0, one_time: 0, inactive: 0, rto: 0 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteModal, setDeleteModal] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 50;
  const { profile, loading: profileLoading } = useCurrentProfile();
  const [showFilters, setShowFilters] = useState(true);
  const [minOrders, setMinOrders] = useState("");
  const [maxOrders, setMaxOrders] = useState("");
  const [lastOrderStart, setLastOrderStart] = useState("");
  const [lastOrderEnd, setLastOrderEnd] = useState("");

  const supabase = createClient();

  const fetchCustomers = useCallback(async (silent = false) => {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      if (!silent) setLoading(true);
      const { MOCK_CUSTOMERS } = await import("@/lib/mockData");
      setCustomers(MOCK_CUSTOMERS as any);
      setStats({ repeat: 1, one_time: 1, inactive: 0, rto: 1 });
      setTotalCount(MOCK_CUSTOMERS.length);
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    let query = supabase.from("customers").select("*", { count: "exact" });

    if (seg !== "all") {
      if (seg === "rto") {
        query = query.eq("rto_flag", true);
      } else {
        query = query.eq("segment", seg);
      }
    }

    if (minOrders) query = query.gte("total_orders", parseInt(minOrders));
    if (maxOrders) query = query.lte("total_orders", parseInt(maxOrders));
    if (lastOrderStart) query = query.gte("last_order_date", lastOrderStart);
    if (lastOrderEnd) query = query.lte("last_order_date", lastOrderEnd);

    if (search) {
      const cleanSearch = search.trim().replace(/^#/, "");
      const isPhone = /^\d{7,15}$/.test(cleanSearch.replace(/\s/g, ""));

      // Step 1: Find customers from Orders matching query
      const { data: matchingOrders } = await supabase
        .from("orders")
        .select("customer_id")
        .or(`order_number.ilike.%${cleanSearch}%,tracking_number.ilike.%${cleanSearch}%`);

      const customerIdsFromOrders = (matchingOrders || []).map(o => o.customer_id);

      // Step 2: Main customer filter
      let orFilter = `email.ilike.%${cleanSearch}%`;
      if (isPhone) {
        orFilter += `,phone.eq.${cleanSearch},phone.ilike.%${cleanSearch}%`;
      } else {
        orFilter += `,name.ilike.%${cleanSearch}%`;
      }

      if (customerIdsFromOrders.length > 0) {
        orFilter += `,id.in.(${customerIdsFromOrders.join(",")})`;
      }
      query = query.or(orFilter);
    }

    const { data: customersData, count } = await query
      .order("name")
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    
    setTotalCount(count || 0);
    
    // Fetch summary stats
    const { data: summaryData } = await supabase.from("v_segment_summary").select("*");
    
    const s = { repeat: 0, one_time: 0, inactive: 0, rto: 0 };
    summaryData?.forEach(row => {
      if (row.segment === "repeat") s.repeat = row.count;
      if (row.segment === "one_time") s.one_time = row.count;
      if (row.segment === "inactive") s.inactive = row.count;
      s.rto += row.rto_flagged || 0;
    });

    setCustomers((customersData || []) as any);
    setStats(s);
    setLoading(false);
    setSelectedIds([]); // Clear selection on refresh
  }, [supabase, seg, search, page, minOrders, maxOrders, lastOrderStart, lastOrderEnd]);

  useEffect(() => {
    fetchCustomers();
    const pollInterval = setInterval(() => {
      debouncedRefresh();
    }, 60000);

    let refreshTimeout: NodeJS.Timeout;
    const debouncedRefresh = () => {
      const isInteracting = document.activeElement?.tagName === 'INPUT' || 
                           document.activeElement?.tagName === 'TEXTAREA' ||
                           document.querySelector('[role="dialog"]');
      if (isInteracting) return;
      clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => fetchCustomers(true), 3000);
    };

    // ── Supabase real-time: refresh when customers are inserted or updated ──
    const channel = supabase
      .channel("customers-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "customers" }, debouncedRefresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "customers" }, debouncedRefresh)
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      clearTimeout(refreshTimeout);
      supabase.removeChannel(channel);
    };
  }, [fetchCustomers, supabase]);

  async function handleGlobalSync() {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      toast.success("Demo: Customer data sync simulated!");
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/heal", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const r = data.report;
        toast.success(
          `✅ Healed: ${r.merged} customers merged, ${r.ordersMerged} orders merged (${r.ordersAmbiguous} left ambiguous), ${r.namesCleaned} names cleaned, ${r.unmasked} phones unmasked, ${r.statsRecalculated} stats fixed` +
          (r.truncated ? " - hit the time budget, click Sync System again to keep going" : ""),
          { duration: r.truncated ? 10000 : 6000 }
        );
      } else {
        toast.error(data.error || "Heal failed");
      }
    } catch (err) {
      toast.error("Failed to heal system data");
    } finally {
      await fetchCustomers();
      setSyncing(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }

  function toggleSelectAll() {
    if (selectedIds.length === customers.length) setSelectedIds([]);
    else setSelectedIds(customers.map(c => c.id));
  }

  async function handleBulkDelete() {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      toast.success(`Demo: Deleted ${selectedIds.length} customers (local only)`);
      setCustomers(prev => prev.filter(c => !selectedIds.includes(c.id)));
      setSelectedIds([]);
      setDeleteModal(false);
      return;
    }
    setIsDeleting(true);
    const { error } = await supabase.from("customers").delete().in("id", selectedIds);
    
    if (error) {
      toast.error("Failed to delete customers");
    } else {
      await logAuditEvent({
        entityType: "customer",
        action: "bulk_delete",
        summary: `Deleted ${selectedIds.length} customers`,
        metadata: { ids: selectedIds },
      });
      toast.success(`${selectedIds.length} customers deleted`);
      fetchCustomers();
      setDeleteModal(false);
    }
    setIsDeleting(false);
  }

  const canDelete = hasPermission(profile, "can_delete");

  return (
    <div className="animate-fade-in">
      <PageHeader title="Customers" subtitle={`${totalCount} matching customers`}
        actions={
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={cn("btn-secondary flex items-center gap-1.5 py-1.5 px-4", showFilters && "bg-[#1c1c1c] text-white border-[#1c1c1c]")}
            >
              <Filter className="w-3.5 h-3.5" />
              {showFilters ? "Hide Filters" : "Filters"}
            </button>

            {canDelete && (
              <button
                onClick={handleGlobalSync}
                disabled={syncing}
                title="Merges duplicate customers and recalculates stats - admin only"
                className={cn(
                  "btn-secondary flex items-center gap-1.5 py-1.5 px-3",
                  syncing && "opacity-50 cursor-not-allowed"
                )}
              >
                <RefreshCw className={cn("w-3.5 h-3.5", (syncing || loading) && "animate-spin")} />
                {syncing ? "Syncing..." : "Sync System"}
              </button>
            )}

            {selectedIds.length > 0 && canDelete ? (
              <button onClick={() => setDeleteModal(true)} className="btn-danger">
                <Trash2 className="w-4 h-4" /> Delete ({selectedIds.length})
              </button>
            ) : (
              <button onClick={() => setAddModal(true)} className="btn-primary">
                <UserPlus className="w-4 h-4" /> Add Customer
              </button>
            )}
          </div>
        }
      />

      <AddCustomerModal 
        open={addModal} 
        onClose={() => setAddModal(false)} 
        onSuccess={fetchCustomers} 
      />

      {/* Advanced Filter Panel */}
      {showFilters && (
        <div className="card p-4 md:p-5 mb-6 animate-slide-down">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <div>
              <label className="text-[9px] md:text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest block mb-1 md:mb-2 opacity-60">Min Orders</label>
              <input type="number" placeholder="0" className="input text-xs bg-[#fcfbf8]" value={minOrders} onChange={e => setMinOrders(e.target.value)} />
            </div>
            <div>
              <label className="text-[9px] md:text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest block mb-1 md:mb-2 opacity-60">Max Orders</label>
              <input type="number" placeholder="999" className="input text-xs bg-[#fcfbf8]" value={maxOrders} onChange={e => setMaxOrders(e.target.value)} />
            </div>
            <div>
              <label className="text-[9px] md:text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest block mb-1 md:mb-2 opacity-60">Last Order From</label>
              <input type="date" className="input text-xs bg-[#fcfbf8]" value={lastOrderStart} onChange={e => setLastOrderStart(e.target.value)} />
            </div>
            <div>
              <label className="text-[9px] md:text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest block mb-1 md:mb-2 opacity-60">Last Order To</label>
              <input type="date" className="input text-xs bg-[#fcfbf8]" value={lastOrderEnd} onChange={e => setLastOrderEnd(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end mt-6 pt-6 border-t border-[#eceae4] gap-4">
            <button 
              onClick={() => {
                setMinOrders("");
                setMaxOrders("");
                setLastOrderStart("");
                setLastOrderEnd("");
                setSeg("all");
              }}
              className="text-[10px] text-rose-500 font-bold uppercase tracking-widest hover:underline"
            >
              Clear All
            </button>
            <button
              // Filters already apply live as each field changes (see the
              // fetchCustomers dependency array above); this button had no
              // handler at all. Give it a real job: close the panel.
              onClick={() => setShowFilters(false)}
              className="btn-primary py-2 px-8 text-[10px] font-bold uppercase tracking-widest"
            >
              Apply Filter
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1 w-full md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#5f5f5d]" />
          <input type="text" placeholder="Search customers..." className="input pl-9 text-xs"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-1 bg-[#eceae4]/30 rounded-xl border border-[#eceae4] p-1 overflow-x-auto scrollbar-hide">
          {SEGS.map(s => (
            <button key={s.value} onClick={() => setSeg(s.value)}
              className={cn("px-4 md:px-5 py-2 rounded-lg text-[9px] md:text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap",
                seg === s.value ? "bg-[#1c1c1c] text-white shadow-md" : "text-[#5f5f5d] hover:bg-[#eceae4]/50"
              )}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Segment summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-10">
        {[
          { label: "Repeat", count: stats.repeat, color: "border-l-[#1c1c1c]" },
          { label: "One-time", count: stats.one_time, color: "border-l-amber-500" },
          { label: "Inactive", count: stats.inactive, color: "border-l-rose-500" },
          { label: "RTO Flag", count: stats.rto, color: "border-l-orange-500" },
        ].map(s => (
          <div key={s.label} className={cn("card p-4 md:p-6 border-l-4", s.color)}>
            <div className="text-xl md:text-3xl font-bold text-[#1c1c1c] tracking-tighter mb-1 md:mb-2">{s.count}</div>
            <div className="text-[9px] md:text-[10px] text-[#5f5f5d] font-bold uppercase tracking-widest">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto scrollbar-hide">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-[40px_2fr_1.5fr_1fr_1fr_1fr_80px] bg-[#eceae4]/30 border-b border-[#eceae4] px-4 py-3 text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">
              <div className="flex items-center justify-center">
                <input type="checkbox" className="checkbox w-3.5 h-3.5" 
                  checked={selectedIds.length === customers.length && customers.length > 0} 
                  onChange={toggleSelectAll} 
                />
              </div>
              <span>Customer</span>
              <span>Contact</span>
              <span>Status</span>
              <span>Orders</span>
              <span>Last Active</span>
              <span>Actions</span>
            </div>
            {loading ? (
              <div className="p-12 text-center text-gray-400 text-sm">Searching...</div>
            ) : customers.length === 0 ? (
              <EmptyState icon={<Search className="w-5 h-5" />} title="No customers found" desc="Try a different search" />
            ) : (
              customers.map(c => (
                <div key={c.id} className={cn("grid grid-cols-[40px_2fr_1.5fr_1fr_1fr_1fr_80px] px-4 py-4 border-b border-[#eceae4]/50 group transition-colors", selectedIds.includes(c.id) ? "bg-[#eceae4]/40" : "hover:bg-[rgba(28,28,28,0.02)]")}>
                  <div className="flex items-center justify-center">
                    <input type="checkbox" className="checkbox w-3.5 h-3.5" 
                      checked={selectedIds.includes(c.id)} 
                      onChange={() => toggleSelect(c.id)} 
                    />
                  </div>
                  <Link href={`/customers/${c.id}`} className="flex items-center gap-3 min-w-0">
                    <Avatar name={c.name} size="sm" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#1c1c1c] truncate hover:underline">{c.name}</div>
                      {c.rto_flag && <div className="text-[9px] text-rose-600 font-bold uppercase tracking-widest flex items-center gap-1 mt-0.5"><AlertTriangle className="w-2.5 h-2.5" /> RTO Alert</div>}
                    </div>
                  </Link>
                  <div className="flex flex-col justify-center min-w-0">
                    <a href={`tel:${c.phone}`} className="text-xs font-bold text-[#1c1c1c] hover:underline">{c.phone}</a>
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="text-[10px] text-[#5f5f5d] font-bold truncate opacity-50">
                        {c.email}
                      </a>
                    )}
                  </div>
                  <div className="flex items-center"><SegmentBadge segment={c.segment} rto={c.rto_flag} /></div>
                  <div className="flex items-center text-xs font-bold text-[#1c1c1c]">{c.total_orders} Orders</div>
                  <div className="flex items-center text-[10px] text-[#5f5f5d] font-bold">{c.last_order_date ? formatDate(c.last_order_date) : "—"}</div>
                  <div className="flex items-center gap-2">
                    <a href={`tel:${c.phone}`} 
                      className="w-7 h-7 rounded-lg bg-[#eceae4] text-[#1c1c1c] flex items-center justify-center hover:bg-[#1c1c1c] hover:text-white transition-all shadow-sm">
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      <Pagination 
        current={page} 
        total={totalCount} 
        pageSize={PAGE_SIZE} 
        onChange={(p) => { setPage(p); window.scrollTo(0, 0); }} 
      />

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Confirm Bulk Deletion"
        footer={<>
          <button className="btn-secondary" onClick={() => setDeleteModal(false)}>Cancel</button>
          <button className="btn-danger" onClick={handleBulkDelete} disabled={isDeleting || !canDelete}>
            {isDeleting ? "Deleting..." : "Delete Permanently"}
          </button>
        </>}
      >
        <p className="text-sm text-gray-600">
          Are you sure you want to delete <strong>{selectedIds.length}</strong> selected customers? This action is irreversible and will also delete all associated orders and tasks.
        </p>
      </Modal>
    </div>
  );
}
