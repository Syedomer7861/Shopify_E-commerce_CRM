import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";

// Vercel Hobby defaults to 10s without this. Paginating a 30-90 day order
// window in 1000-row pages is usually a couple seconds, but not guaranteed.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createServerClient();
  const searchParams = req.nextUrl.searchParams;
  const days = parseInt(searchParams.get("days") || "30");

  try {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);
    const thresholdDay = dateThreshold.toISOString().slice(0, 10);

    const stateStats: Record<string, { orders: number; revenue: number; rto: number }> = {};
    let totalOrders = 0;
    let totalRevenue = 0;
    let totalRto = 0;

    const add = (rawState: string, orders: number, revenue: number, rto: number) => {
      const state = (rawState || "").trim();
      if (!state) return;
      const key = state.toLowerCase().split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      const s = (stateStats[key] ||= { orders: 0, revenue: 0, rto: 0 });
      s.orders += orders;
      s.revenue += revenue;
      s.rto += rto;
      totalOrders += orders;
      totalRevenue += revenue;
      totalRto += rto;
    };

    // Fast path: per-state daily rollup (a few hundred rows) instead of
    // paging thousands of joined order+customer rows.
    const { data: roll, error: rollErr } = await supabase
      .from("rollup_daily_state_orders")
      .select("state, orders, revenue, rto")
      .gte("day", thresholdDay);

    if (!rollErr && roll && roll.length > 0) {
      for (const r of roll) add(r.state, r.orders || 0, Number(r.revenue) || 0, r.rto || 0);
    } else {
      // Fallback: live pagination (pre-rollup behaviour). Kept so the map
      // still works before the migration / first cron run.
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("orders")
          .select("total_price, delivery_status, customer:customers(state)")
          .gte("ordered_at", dateThreshold.toISOString())
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const o of data as any[]) {
          add(
            o.customer?.state || "",
            1,
            parseFloat(o.total_price || 0),
            o.delivery_status?.toLowerCase() === "rto" ? 1 : 0,
          );
        }
        if (data.length < PAGE) break;
      }
    }

    const results = Object.entries(stateStats).map(([name, s]) => ({
      name,
      orders: s.orders,
      revenue: s.revenue,
      rto: s.rto,
      orderPercentage: totalOrders > 0 ? (s.orders / totalOrders) * 100 : 0,
      revenuePercentage: totalRevenue > 0 ? (s.revenue / totalRevenue) * 100 : 0,
      rtoRate: s.orders > 0 ? (s.rto / s.orders) * 100 : 0
    })).sort((a, b) => b.orders - a.orders);

    return NextResponse.json({
      states: results,
      summary: {
        totalOrders,
        totalRevenue,
        totalRto,
        avgRtoRate: totalOrders > 0 ? (totalRto / totalOrders) * 100 : 0,
        days,
        generatedAt: new Date().toISOString(),
      }
    });
  } catch (e: any) {
    console.error("[Geospatial API] Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
