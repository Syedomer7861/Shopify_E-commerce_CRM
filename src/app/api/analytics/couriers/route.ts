import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
// Vercel Hobby defaults to 10s without this. Paginating 20k+ orders in
// 1000-row pages is usually a couple seconds, but not guaranteed under 10.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  try {
    const supabase = createServerClient();

    // 1. Fetch data for Courier Performance
    // PostgREST caps a single select at 1000 rows. With 20k+ real orders,
    // an unranged select here silently returned only the oldest 1000 (no
    // ORDER BY = insertion order) - "Total Orders: 1000" on the Manager Hub
    // was literally the cap, not the real count, and every derived stat
    // (success rate, RTO rate, courier rankings, status donut) was computed
    // from ~4% of real volume. Page through with .range() for the real total.
    const PAGE = 1000;
    let ordersList: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("orders")
        .select("courier_name, delivery_status, created_at")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      ordersList = ordersList.concat(data);
      if (data.length < PAGE) break;
    }
    console.log(`[Analytics API] Fetched ${ordersList.length} orders from DB.`);

    const courierStats: Record<string, { delivered: number, rto: number, total: number }> = {};
    const statusStats: Record<string, number> = {};
    
    let totalShipments = 0;
    let deliveredCount = 0;
    let rtoCount = 0;
    let ndrCount = 0;
    let inTransitCount = 0;

    ordersList.forEach((order: any) => {
      totalShipments++;
      
      // Global Status Distribution
      const status = order.delivery_status?.toLowerCase() || "pending";
      statusStats[status] = (statusStats[status] || 0) + 1;

      if (status === "delivered") deliveredCount++;
      if (status === "rto") rtoCount++;
      if (status.includes("ndr")) ndrCount++;
      if (status === "in-transit" || status === "shipped") inTransitCount++;

      // Per Courier Stats
      if (order.courier_name) {
        const courier = order.courier_name;
        if (!courierStats[courier]) {
          courierStats[courier] = { delivered: 0, rto: 0, total: 0 };
        }
        courierStats[courier].total++;
        if (status === "delivered") courierStats[courier].delivered++;
        if (status === "rto") courierStats[courier].rto++;
      }
    });

    const courierResult = Object.entries(courierStats).map(([name, s]) => ({
      name,
      delivered: s.delivered,
      rto: s.rto,
      successRate: s.total > 0 ? (s.delivered / s.total) * 100 : 0,
      rtoRate: s.total > 0 ? (s.rto / s.total) * 100 : 0,
      total: s.total
    })).sort((a, b) => b.successRate - a.successRate);

    // Map status stats to chart format
    const statusResult = Object.entries(statusStats).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value
    })).sort((a, b) => b.value - a.value);

    return NextResponse.json({
      couriers: courierResult,
      statusDistribution: statusResult,
      debug: {
        rawCount: ordersList.length,
        sample: ordersList.slice(0, 5)
      },
      summary: {
        total: totalShipments,
        delivered: deliveredCount,
        rto: rtoCount,
        ndr: ndrCount,
        inTransit: inTransitCount,
        successRate: totalShipments > 0 ? (deliveredCount / totalShipments) * 100 : 0,
        rtoRate: totalShipments > 0 ? (rtoCount / totalShipments) * 100 : 0
      }
    });
  } catch (e: any) {
    return NextResponse.json({ 
      error: e?.message || typeof e === 'string' ? e : "Unknown API Error",
      rawError: JSON.parse(JSON.stringify(e || {})) 
    }, { status: 500 });
  }
}
