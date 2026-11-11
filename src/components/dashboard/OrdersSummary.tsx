"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { IndianRupee, Package, AlertTriangle, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import type { Order } from "@/types";

/**
 * Order and revenue snapshot - a home-screen widget (see
 * components/workspace/WorkspaceHome) for roles that work with orders but
 * not the call queue: Accountant, Logistics, E-commerce Manager.
 */
export function OrdersSummary() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ ordersToday: 0, revenueThisMonth: 0, pending: 0, rto: 0 });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      const [todayRes, monthRes, pendingRes, rtoRes, recentRes] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", startOfToday),
        supabase.from("orders").select("total_price").gte("created_at", startOfMonth),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("delivery_status", "pending"),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("delivery_status", "rto"),
        supabase.from("orders").select("*, customer:customers(name)").order("created_at", { ascending: false }).limit(5),
      ]);

      if (!active) return;
      const revenue = (monthRes.data || []).reduce((sum, o: any) => sum + (o.total_price || 0), 0);
      setStats({
        ordersToday: todayRes.count || 0,
        revenueThisMonth: revenue,
        pending: pendingRes.count || 0,
        rto: rtoRes.count || 0,
      });
      setRecentOrders((recentRes.data || []) as Order[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard icon={<Package className="w-4 h-4" />} label="Orders Today" value={loading ? "-" : stats.ordersToday} />
        <StatCard icon={<IndianRupee className="w-4 h-4" />} label="Revenue This Month" value={loading ? "-" : `₹${stats.revenueThisMonth.toLocaleString("en-IN")}`} />
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Pending Delivery" value={loading ? "-" : stats.pending} />
        <StatCard icon={<TrendingUp className="w-4 h-4" />} label="RTO" value={loading ? "-" : stats.rto} />
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[#1c1c1c]">Recent Orders</h3>
          <Link href="/orders" className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] hover:text-[#1c1c1c]">
            View all
          </Link>
        </div>
        {loading ? (
          <div className="py-8 text-center text-xs text-gray-400">Loading...</div>
        ) : recentOrders.length === 0 ? (
          <div className="py-8 text-center text-xs text-gray-400">No orders yet.</div>
        ) : (
          <div className="space-y-2">
            {recentOrders.map(o => (
              <div key={o.id} className="flex items-center justify-between p-3 rounded-xl border border-[#eceae4]">
                <div>
                  <div className="text-xs font-bold text-[#1c1c1c]">#{o.order_number || o.shopify_order_id}</div>
                  <div className="text-[10px] text-gray-400">{(o as any).customer?.name || "Customer"}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-[#1c1c1c]">&#8377;{(o.total_price || 0).toLocaleString("en-IN")}</div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{o.delivery_status}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
