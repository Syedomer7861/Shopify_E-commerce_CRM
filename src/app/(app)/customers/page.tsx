"use client";
import { useState, useEffect } from "react";
import { Search, UserPlus, Phone, AlertTriangle, RefreshCw, Trash2, CheckCircle, X } from "lucide-react";
import Link from "next/link";
import { PageHeader, SegmentBadge, Avatar, EmptyState, Modal } from "@/components/ui";
import { AddCustomerModal } from "@/components/AddCustomerModal";
import { createClient } from "@/lib/supabase";
import { cn, formatDate } from "@/lib/utils";
import type { Customer, CustomerSegment } from "@/types";
import toast from "react-hot-toast";

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
  
  const supabase = createClient();

  useEffect(() => {
    fetchCustomers();
  }, [seg, search]);

  async function fetchCustomers() {
    setLoading(true);
    let query = supabase.from("customers").select("*");

    if (seg !== "all") {
      if (seg === "rto") {
        query = query.eq("rto_flag", true);
      } else {
        query = query.eq("segment", seg);
      }
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: customersData } = await query.order("name");
    
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
      const res = await fetch("/api/sync/all", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(`Sync Complete: ${data.report.logs.processed} logs, ${data.report.tasks.generated} tasks`);
      } else {
        toast.error(data.error || "Sync failed");
      }
    } catch (err) {
      toast.error("Failed to sync system");
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
      toast.success(`${selectedIds.length} customers deleted`);
      fetchCustomers();
      setDeleteModal(false);
    }
    setIsDeleting(false);
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Customers" subtitle={`${customers.length} matching customers`}
        actions={
          <div className="flex items-center gap-2">
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

            {selectedIds.length > 0 ? (
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
              className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                seg === s.value ? "bg-forest text-lime shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Segment summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Repeat", count: stats.repeat, color: "border-l-emerald-500" },
          { label: "One-time", count: stats.one_time, color: "border-l-amber-500" },
          { label: "Inactive", count: stats.inactive, color: "border-l-rose-500" },
          { label: "RTO", count: stats.rto, color: "border-l-orange-500" },
        ].map(s => (
          <div key={s.label} className={cn("card p-3 border-l-4", s.color)}>
            <div className="text-lg font-bold text-forest">{s.count}</div>
            <div className="text-xs text-gray-500">{s.label}</div>
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
            <div key={c.id} className={cn("table-row grid grid-cols-[40px_2fr_1.5fr_1fr_1fr_1fr_80px]", selectedIds.includes(c.id) && "bg-forest/5")}>
              <div className="flex items-center justify-center">
                <input type="checkbox" className="checkbox w-4 h-4" 
                  checked={selectedIds.includes(c.id)} 
                  onChange={() => toggleSelect(c.id)} 
                />
              </div>
              <Link href={`/customers/${c.id}`} className="flex items-center gap-3 min-w-0">
                <Avatar name={c.name} size="sm" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-forest truncate hover:underline">{c.name}</div>
                  {c.rto_flag && <div className="text-[10px] text-orange-600 flex items-center gap-0.5 mt-0.5"><AlertTriangle className="w-2.5 h-2.5" /> RTO flagged</div>}
                </div>
              </Link>
              <div className="flex flex-col justify-center min-w-0">
                <a href={`tel:${c.phone}`} className="text-xs text-gray-700 hover:text-blue-600 transition-colors">{c.phone}</a>
                {c.email && (
                  <a href={`mailto:${c.email}`} className="text-[11px] text-gray-400 truncate hover:text-emerald-600 transition-colors">
                    {c.email}
                  </a>
                )}
              </div>
              <div className="flex items-center"><SegmentBadge segment={c.segment} rto={c.rto_flag} /></div>
              <div className="flex items-center text-sm text-gray-700">{c.total_orders} orders</div>
              <div className="flex items-center text-xs text-gray-500">{c.last_order_date ? formatDate(c.last_order_date) : "—"}</div>
              <div className="flex items-center gap-2">
                <a href={`tel:${c.phone}`} 
                  className="w-7 h-7 rounded-lg bg-forest/5 hover:bg-forest/10 flex items-center justify-center transition-colors">
                  <Phone className="w-3.5 h-3.5 text-forest" />
                </a>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="text-xs text-gray-400 mt-3 text-right">Showing {customers.length} customers</div>

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Confirm Bulk Deletion"
        footer={<>
          <button className="btn-secondary" onClick={() => setDeleteModal(false)}>Cancel</button>
          <button className="btn-danger" onClick={handleBulkDelete} disabled={isDeleting}>
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
