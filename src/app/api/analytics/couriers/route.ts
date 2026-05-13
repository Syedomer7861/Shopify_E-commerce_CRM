import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();

    // 1. Fetch data for Courier Performance
    const { data: allOrders, error } = await supabase
      .from("orders")
      .select("courier_name, delivery_status, created_at");

    if (error) throw error;
    
    const ordersList = allOrders || [];
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
