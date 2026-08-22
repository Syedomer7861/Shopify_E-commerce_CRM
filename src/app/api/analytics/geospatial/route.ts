import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createServerClient();
  const searchParams = req.nextUrl.searchParams;
  const days = parseInt(searchParams.get("days") || "30");

  try {
    // 1. Fetch orders with customer state data
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);

    const { data: allOrders, error } = await supabase
      .from("orders")
      .select(`
        id,
        total_price,
        delivery_status,
        ordered_at,
        customer:customers (
          state
        )
      `)
      .gte("ordered_at", dateThreshold.toISOString());

    if (error) throw error;

    const stateStats: Record<string, { 
      orders: number, 
      revenue: number, 
      rto: number,
      customers: Set<string> 
    }> = {};

    let totalOrders = 0;
    let totalRevenue = 0;
    let totalRto = 0;

    allOrders?.forEach((order: any) => {
      const state = order.customer?.state?.trim();
      if (!state) return;

      // Normalize state name for mapping (Title Case)
      const normalizedState = state.toLowerCase().split(' ').map((word: string) => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');

      if (!stateStats[normalizedState]) {
        stateStats[normalizedState] = { 
          orders: 0, 
          revenue: 0, 
          rto: 0,
          customers: new Set()
        };
      }

      const orderRevenue = parseFloat(order.total_price || 0);
      const isRto = order.delivery_status?.toLowerCase() === "rto";

      stateStats[normalizedState].orders++;
      stateStats[normalizedState].revenue += orderRevenue;
      if (isRto) stateStats[normalizedState].rto++;
      
      totalOrders++;
      totalRevenue += orderRevenue;
      if (isRto) totalRto++;
    });

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
