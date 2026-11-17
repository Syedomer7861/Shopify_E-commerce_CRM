"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { IndianRupee, Package, AlertTriangle, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import type { Order } from "@/types";
import { applyDateRange, rangeLabel, type DateRange } from "@/components/DateRangeFilter";

// Fallback only (before migration 20261117j is applied): page through rows,
// since PostgREST caps one select at 1000.
async function sumRevenue(make: () => any): Promise<number> {
  let total = 0;
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await make().range(from, from + 999);
    if (error || !data?.length) break;
    total += data.reduce((s: number, o: any) => s + (Number(o.total_price) || 0), 0);
    if (data.length < 1000) break;
  }
  return total;
}

/** Revenue summed in the database (orders_revenue_sum, RLS applies); same bounds as applyDateRange. */
async function revenueSum(supabase: ReturnType<typeof createClient>, range: DateRange | null, startOfMonth: string): Promise<number> {
  const b: { from?: string; to?: string } = { from: range ? undefined : startOfMonth };
  if (range) {
    const cap = { gte: (_: string, v: string) => ((b.from = v), cap), lt: (_: string, v: string) => ((b.to = v), cap), lte: (_: string, v: string) => ((b.to = v), cap) };
    applyDateRange(cap, "created_at", range);
  }
  const { data, error } = await supabase.rpc("orders_revenue_sum", { p_from: b.from ?? null, p_to: b.to ?? null });
  if (!error && data != null) return Number(data) || 0;
  return sumRevenue(() => range ? applyDateRange(supabase.from("orders").select("total_price"), "created_at", range) : supabase.from("orders").select("total_price").gte("created_at", startOfMonth));
}

/**
 * Order and revenue snapshot - a home-screen widget (see
 * components/workspace/WorkspaceHome) for roles that work with orders but
 * not the call queue: Accountant, Logistics, E-commerce Manager.
 */
export function OrdersSummary({ range }: { range?: DateRange }) {
  const dated = Boolean(range?.from || range?.to);
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

      // With a period chosen, the first two cards cover that period instead of today / this month.
      const countQ = supabase.from("orders").select("id", { count: "exact", head: true });
      const [todayRes, monthRes, pendingRes, rtoRes, recentRes] = await Promise.all([
        dated ? applyDateRange(countQ, "created_at", range!) : countQ.gte("created_at", startOfToday),
        revenueSum(supabase, dated ? range! : null, startOfMonth),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("delivery_status", "pending"),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("delivery_status", "rto"),
        supabase.from("orders").select("*, customer:customers(name)").order("created_at", { ascending: false }).limit(5),
      ]);

      if (!active) return;
      const revenue = monthRes;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.from, range?.to]);

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard icon={<Package className="w-4 h-4" />} label={dated ? `Orders · ${rangeLabel(range!)}` : "Orders Today"} value={loading ? "-" : stats.ordersToday} />
        <StatCard icon={<IndianRupee className="w-4 h-4" />} label={dated ? `Revenue · ${rangeLabel(range!)}` : "Revenue This Month"} value={loading ? "-" : `₹${stats.revenueThisMonth.toLocaleString("en-IN")}`} />
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
              <div key={o.id} className="flex items-center justify-between p-3 rounded-xl border border-[#ebece6]">
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
