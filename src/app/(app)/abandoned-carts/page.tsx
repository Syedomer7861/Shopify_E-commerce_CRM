"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { PageHeader } from "@/components/ui";
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
import { cn } from "@/lib/utils";

export default function AbandonedCartsPage() {
  const [carts, setCarts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");

  const supabase = createClient();

  useEffect(() => {
    fetchCarts();
  }, [statusFilter]);

  async function fetchCarts() {
    setLoading(true);
    try {
      let query = supabase
        .from("abandoned_carts")
        .select("*, customer:customers(name, phone)")
        .order("abandoned_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("recovery_status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCarts(data || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load abandoned carts");
    } finally {
      setLoading(false);
    }
  }

  async function deleteCart(id: string) {
    if (!confirm("Are you sure you want to delete this record?")) return;
    try {
      const { error } = await supabase.from("abandoned_carts").delete().eq("id", id);
      if (error) throw error;
      toast.success("Record deleted");
      fetchCarts();
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
    const message = `Hi ${name}, we noticed you left some ${items} in your cart at CureForever. Since these items are in high demand, we wanted to check if you had any questions or needed help completing your order?`;
    return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
  }

  const filteredCarts = carts.filter(c => 
    c.phone.includes(search) || 
    (c.customer?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    totalValue: carts.reduce((acc, c) => acc + (Number(c.total_price) || 0), 0),
    recoveredValue: carts.filter(c => c.recovery_status === "recovered").reduce((acc, c) => acc + (Number(c.total_price) || 0), 0),
    pendingCount: carts.filter(c => c.recovery_status === "pending").length
  };

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader 
        title="Abandoned Carts" 
        subtitle="Recover lost revenue by following up with interested shoppers"
      />

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card p-5 border-l-4 border-l-amber-400">
          <div className="flex items-center gap-3 mb-2 text-gray-500">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Pending Recovery</span>
          </div>
          <div className="text-2xl font-display text-forest font-bold">{stats.pendingCount}</div>
          <div className="text-[10px] text-gray-400 mt-1">Carts waiting for follow-up</div>
        </div>
        <div className="card p-5 border-l-4 border-l-rose-400">
          <div className="flex items-center gap-3 mb-2 text-gray-500">
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Potential Revenue</span>
          </div>
          <div className="text-2xl font-display text-rose-600 font-bold">₹{stats.totalValue.toLocaleString()}</div>
          <div className="text-[10px] text-gray-400 mt-1">Total value of all abandoned items</div>
        </div>
        <div className="card p-5 border-l-4 border-l-emerald-400">
          <div className="flex items-center gap-3 mb-2 text-gray-500">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Recovered Revenue</span>
          </div>
          <div className="text-2xl font-display text-emerald-600 font-bold">₹{stats.recoveredValue.toLocaleString()}</div>
          <div className="text-[10px] text-gray-400 mt-1">Orders secured after follow-up</div>
        </div>
      </div>

      {/* Filters & Actions */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by name or phone..." 
            className="input pl-10 h-10 text-sm w-full"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {["pending", "recovered", "all"].map(f => (
            <button 
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn("px-4 h-10 text-xs font-semibold rounded-xl transition-all capitalize",
                statusFilter === f ? "bg-forest text-lime shadow-sm" : "bg-white text-gray-500 border border-gray-100 hover:bg-gray-50"
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
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="text-left py-4 px-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Customer info</th>
                <th className="text-left py-4 px-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cart Details</th>
                <th className="text-left py-4 px-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Abandoned At</th>
                <th className="text-left py-4 px-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                <th className="text-right py-4 px-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={5} className="py-20 text-center text-gray-400">Loading abandoned carts...</td></tr>
              ) : filteredCarts.length === 0 ? (
                <tr><td colSpan={5} className="py-20 text-center text-gray-400 italic">No carts found matching your filters.</td></tr>
              ) : filteredCarts.map(cart => (
                <tr key={cart.id} className="hover:bg-gray-50/30 transition-colors group">
                  <td className="py-4 px-6">
                    <div className="font-semibold text-forest uppercase tracking-tight">{cart.customer?.name || "Anonymous"}</div>
                    <div className="text-xs text-gray-500 font-mono">{cart.phone}</div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2 mb-1">
                      <ShoppingBag className="w-3.5 h-3.5 text-gray-400" />
                      <span className="font-bold text-gray-700">₹{cart.total_price?.toLocaleString()}</span>
                    </div>
                    <div className="text-[11px] text-gray-400 truncate max-w-[200px]">
                      {(cart.line_items as any[])?.map(i => i.title).join(", ") || "No items"}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-xs text-gray-500">
                    {format(new Date(cart.abandoned_at), "MMM dd, hh:mm a")}
                  </td>
                  <td className="py-4 px-6">
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      cart.recovery_status === "recovered" ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                    )}>
                      {cart.recovery_status}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                       <a 
                        href={getWhatsAppLink(cart)} 
                        target="_blank" 
                        className="btn-primary py-1.5 px-3 h-8 text-[10px] bg-[#25D366] border-none hover:bg-[#128C7E] flex items-center gap-1.5 shadow-none"
                      >
                        <MessageCircle className="w-3 h-3" /> Follow Up
                      </a>
                      <button 
                        onClick={() => deleteCart(cart.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition-colors"
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
      </div>
    </div>
  );
}
