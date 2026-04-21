"use client";
import { useState, useEffect } from "react";
import { Search, UserPlus, Phone, AlertTriangle, RefreshCw, Trash2, CheckCircle, X, Filter } from "lucide-react";
import Link from "next/link";
import { PageHeader, SegmentBadge, Avatar, EmptyState, Modal } from "@/components/ui";
import { AddCustomerModal } from "@/components/AddCustomerModal";
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

  useEffect(() => {
    fetchCustomers();
  }, [seg, search, page, minOrders, maxOrders, lastOrderStart, lastOrderEnd]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [seg, search, minOrders, maxOrders, lastOrderStart, lastOrderEnd]);

  async function fetchCustomers() {
    setLoading(true);
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
  }

  async function handleGlobalSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/heal", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const r = data.report;
        toast.success(
          `✅ Healed: ${r.merged} duplicates merged, ${r.unmasked} phones unmasked, ${r.statsRecalculated} stats fixed`,
          { duration: 6000 }
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
              className={cn("btn-secondary flex items-center gap-1.5 py-1.5 px-4", showFilters && "bg-[#2D1E6F]/10 border-[#2D1E6F] text-[#2D1E6F]")}
            >
              <Filter className="w-3.5 h-3.5" />
              {showFilters ? "Hide Filters" : "Filters"}
            </button>

            <button 
              onClick={handleGlobalSync} 
              disabled={syncing}
              className={cn(
                "btn-secondary flex items-center gap-1.5 py-1.5 px-3",
                syncing && "opacity-50 cursor-not-allowed"
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", (syncing || loading) && "animate-spin")} />
              {syncing ? "Syncing..." : "Sync System"}
            </button>

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
        <div className="card p-4 mb-5 border-[#2D1E6F]/10 animate-slide-down bg-white shadow-lg overflow-visible z-10">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Min Orders</label>
              <input type="number" placeholder="0" className="input text-xs" value={minOrders} onChange={e => setMinOrders(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Max Orders</label>
              <input type="number" placeholder="999" className="input text-xs" value={maxOrders} onChange={e => setMaxOrders(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Last Order From</label>
              <input type="date" className="input text-xs" value={lastOrderStart} onChange={e => setLastOrderStart(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Last Order To</label>
              <input type="date" className="input text-xs" value={lastOrderEnd} onChange={e => setLastOrderEnd(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end mt-4 pt-4 border-t border-gray-100 gap-2">
            <button 
              onClick={() => {
                setMinOrders("");
                setMaxOrders("");
                setLastOrderStart("");
                setLastOrderEnd("");
                setSeg("all");
              }}
              className="text-xs text-rose-500 font-bold hover:underline py-2 px-3"
            >
              Reset All
            </button>
            <button 
              onClick={() => {}}
              className="btn-primary py-2 px-8 text-xs"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search by name, phone or email..." className="input pl-9"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1 overflow-x-auto scroller-hide">
          {SEGS.map(s => (
            <button key={s.value} onClick={() => setSeg(s.value)}
              className={cn("px-4 py-2 rounded-md text-xs font-bold transition-all whitespace-nowrap",
                seg === s.value ? "bg-[#2D1E6F] text-white shadow-sm" : "text-gray-500 hover:text-[#2D1E6F]"
              )}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Segment summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Repeat", count: stats.repeat, color: "border-l-blue-600" },
          { label: "One-time", count: stats.one_time, color: "border-l-amber-500" },
          { label: "Inactive", count: stats.inactive, color: "border-l-rose-500" },
          { label: "RTO", count: stats.rto, color: "border-l-orange-500" },
        ].map(s => (
          <div key={s.label} className={cn("card p-4 border-l-4", s.color)}>
            <div className="text-xl font-bold text-[#2D1E6F]">{s.count}</div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="table-container">
        <div className="grid grid-cols-[40px_2fr_1.5fr_1fr_1fr_1fr_80px] table-header">
          <div className="flex items-center justify-center">
            <input type="checkbox" className="checkbox w-4 h-4" 
              checked={selectedIds.length === customers.length && customers.length > 0} 
              onChange={toggleSelectAll} 
            />
          </div>
          <span>Customer</span><span>Phone / Email</span><span>Segment</span>
          <span>Orders</span><span>Last Order</span><span>Actions</span>
        </div>
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Searching...</div>
        ) : customers.length === 0 ? (
          <EmptyState icon={<Search className="w-5 h-5" />} title="No customers found" desc="Try a different search" />
        ) : (
          customers.map(c => (
            <div key={c.id} className={cn("table-row grid grid-cols-[40px_2fr_1.5fr_1fr_1fr_1fr_80px]", selectedIds.includes(c.id) && "bg-[#2D1E6F]/5")}>
              <div className="flex items-center justify-center">
                <input type="checkbox" className="checkbox w-4 h-4" 
                  checked={selectedIds.includes(c.id)} 
                  onChange={() => toggleSelect(c.id)} 
                />
              </div>
              <Link href={`/customers/${c.id}`} className="flex items-center gap-3 min-w-0">
                <Avatar name={c.name} size="sm" />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#2D1E6F] truncate hover:underline">{c.name}</div>
                  {c.rto_flag && <div className="text-[10px] text-orange-600 font-bold flex items-center gap-0.5 mt-0.5"><AlertTriangle className="w-2.5 h-2.5" /> RTO flagged</div>}
                </div>
              </Link>
              <div className="flex flex-col justify-center min-w-0">
                <a href={`tel:${c.phone}`} className="text-xs text-gray-700 hover:text-blue-600 transition-colors">{c.phone}</a>
                {c.email && (
                  <a href={`mailto:${c.email}`} className="text-[11px] text-gray-400 truncate hover:text-blue-600 transition-colors">
                    {c.email}
                  </a>
                )}
              </div>
              <div className="flex items-center"><SegmentBadge segment={c.segment} rto={c.rto_flag} /></div>
              <div className="flex items-center text-sm text-gray-700">{c.total_orders} orders</div>
              <div className="flex items-center text-xs text-gray-500">{c.last_order_date ? formatDate(c.last_order_date) : "—"}</div>
              <div className="flex items-center gap-2">
                <a href={`tel:${c.phone}`} 
                  className="w-8 h-8 rounded-lg bg-[#2D1E6F]/5 hover:bg-[#2D1E6F]/10 flex items-center justify-center transition-colors">
                  <Phone className="w-4 h-4 text-[#2D1E6F]" />
                </a>
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* Pagination Controls */}
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-8 pb-4">
          <p className="text-xs text-gray-500">
            Showing <strong>{(page - 1) * PAGE_SIZE + 1}</strong> to <strong>{Math.min(page * PAGE_SIZE, totalCount)}</strong> of <strong>{totalCount}</strong> customers
          </p>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo(0, 0); }}
              disabled={page === 1}
              className="btn-secondary px-3 py-1.5 disabled:opacity-50 text-xs"
            >
              Previous
            </button>
            <div className="flex items-center gap-1 mx-2">
              {[...Array(Math.min(5, Math.ceil(totalCount / PAGE_SIZE)))].map((_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => { setPage(pageNum); window.scrollTo(0, 0); }}
                    className={cn(
                      "w-8 h-8 rounded-md text-xs font-bold transition-all",
                      page === pageNum ? "bg-[#2D1E6F] text-white shadow-sm" : "hover:bg-gray-100 text-gray-500"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
              {Math.ceil(totalCount / PAGE_SIZE) > 5 && (
                 <span className="text-gray-400 text-xs px-1">...</span>
              )}
            </div>
            <button 
              onClick={() => { setPage(p => Math.min(Math.ceil(totalCount / PAGE_SIZE), p + 1)); window.scrollTo(0, 0); }}
              disabled={page >= Math.ceil(totalCount / PAGE_SIZE)}
              className="btn-secondary px-3 py-1.5 disabled:opacity-50 text-xs"
            >
              Next
            </button>
          </div>
        </div>
      )}

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
