import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

// Shiprocket stores one courier_name per service tier ("Delhivery Surface",
// "Delhivery Air 500gm", "Xpressbees B2C 1 K.G"...). Grouping by the raw string
// produced 40+ near-duplicate bars. Collapse to the parent brand.
const COURIER_ALIASES: [RegExp, string][] = [
  [/delhivery/i, "Delhivery"],
  [/blue\s*dart|bluedart/i, "BlueDart"],
  [/xpress\s*bees|xpressbees/i, "XpressBees"],
  [/ecom\s*express|ecomexpress/i, "Ecom Express"],
  [/\bdtdc\b/i, "DTDC"],
  [/shadowfax/i, "Shadowfax"],
  [/ekart/i, "Ekart"],
  [/amazon/i, "Amazon Shipping"],
  [/india\s*post|speed\s*post|postal/i, "India Post"],
  [/fedex/i, "FedEx"],
  [/professional/i, "Professional Couriers"],
  [/trackon/i, "Trackon"],
  [/\bgati\b/i, "Gati"],
  [/wow\s*express/i, "WOW Express"],
  [/smartr/i, "SMARTR"],
];

function normalizeCourier(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  for (const [re, label] of COURIER_ALIASES) if (re.test(s)) return label;
  const c = s
    .replace(/\d+(\.\d+)?\s*(k\.?\s?g|kgs?|gms?|grams?)\b/gi, " ")
    .replace(/\b(surface|air|express|prepaid|cod|category|priority|standard|lite|heavy|domestic|b2c|b2b|reverse|forward)\b/gi, " ")
    .replace(/[^\w\s&-]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!c || c.length < 3 || /^\d+$/.test(c)) return null;
  if (/^(typo|incident|test|na|null|undefined|shiprocket|manual|self)$/i.test(c)) return null;
  return c.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

type CourierRaw = Record<string, { delivered: number; rto: number; total: number }>;

// Shared tail: fold raw courier_name buckets into parent brands, rank, and
// shape the response. Used by both the rollup path and the live fallback.
function shape(rawCourier: CourierRaw, statusStats: Record<string, number>, counts: {
  total: number; delivered: number; rto: number; ndr: number; inTransit: number;
}, source: "rollup" | "live", rawCount: number) {
  const courierStats: CourierRaw = {};
  for (const [raw, v] of Object.entries(rawCourier)) {
    const brand = normalizeCourier(raw);
    if (!brand) continue;
    const c = (courierStats[brand] ||= { delivered: 0, rto: 0, total: 0 });
    c.total += v.total;
    c.delivered += v.delivered;
    c.rto += v.rto;
  }

  const couriers = Object.entries(courierStats)
    .map(([name, s]) => ({
      name,
      delivered: s.delivered,
      rto: s.rto,
      successRate: s.total > 0 ? (s.delivered / s.total) * 100 : 0,
      rtoRate: s.total > 0 ? (s.rto / s.total) * 100 : 0,
      total: s.total,
    }))
    .filter((c) => c.total >= 3)
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  const statusDistribution = Object.entries(statusStats)
    .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
    .sort((a, b) => b.value - a.value);

  return NextResponse.json({
    couriers,
    statusDistribution,
    debug: { source, rawCount },
    summary: {
      total: counts.total,
      delivered: counts.delivered,
      rto: counts.rto,
      ndr: counts.ndr,
      inTransit: counts.inTransit,
      successRate: counts.total > 0 ? (counts.delivered / counts.total) * 100 : 0,
      rtoRate: counts.total > 0 ? (counts.rto / counts.total) * 100 : 0,
    },
  });
}

// Live path: page the full orders table (the pre-rollup behaviour). Kept as a
// fallback so the endpoint still works before the migration/cron have run.
async function liveFallback(supabase: ReturnType<typeof createServerClient>) {
  const PAGE = 1000;
  let rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("orders")
      .select("courier_name, delivery_status")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows = rows.concat(data);
    if (data.length < PAGE) break;
  }

  const rawCourier: CourierRaw = {};
  const statusStats: Record<string, number> = {};
  const counts = { total: 0, delivered: 0, rto: 0, ndr: 0, inTransit: 0 };

  for (const o of rows) {
    counts.total++;
    const st = (o.delivery_status || "pending").toLowerCase();
    statusStats[st] = (statusStats[st] || 0) + 1;
    if (st === "delivered") counts.delivered++;
    if (st === "rto") counts.rto++;
    if (st.includes("ndr")) counts.ndr++;
    if (["in_transit", "in-transit", "out_for_delivery", "shipped"].includes(st)) counts.inTransit++;

    const raw = (o.courier_name || "").trim();
    if (!raw) continue;
    const c = (rawCourier[raw] ||= { delivered: 0, rto: 0, total: 0 });
    c.total++;
    if (st === "delivered") c.delivered++;
    if (st === "rto") c.rto++;
  }
  return shape(rawCourier, statusStats, counts, "live", rows.length);
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  try {
    const supabase = createServerClient();

    // Fast path: nightly rollup (~1 row/day) instead of paging 20k+ orders.
    const { data: roll, error: rollErr } = await supabase
      .from("rollup_daily_orders")
      .select("orders_total, delivered, rto, ndr, in_transit, by_courier, by_status");

    if (!rollErr && roll && roll.length > 0) {
      const rawCourier: CourierRaw = {};
      const statusStats: Record<string, number> = {};
      const counts = { total: 0, delivered: 0, rto: 0, ndr: 0, inTransit: 0 };

      for (const d of roll) {
        counts.total += d.orders_total || 0;
        counts.delivered += d.delivered || 0;
        counts.rto += d.rto || 0;
        counts.ndr += d.ndr || 0;
        counts.inTransit += d.in_transit || 0;

        for (const [st, n] of Object.entries((d.by_status as Record<string, number>) || {})) {
          statusStats[st] = (statusStats[st] || 0) + (Number(n) || 0);
        }
        for (const [raw, v] of Object.entries((d.by_courier as Record<string, any>) || {})) {
          const c = (rawCourier[raw] ||= { delivered: 0, rto: 0, total: 0 });
          c.total += Number(v?.total) || 0;
          c.delivered += Number(v?.delivered) || 0;
          c.rto += Number(v?.rto) || 0;
        }
      }
      return shape(rawCourier, statusStats, counts, "rollup", roll.length);
    }

    // Rollup table missing (migration not applied) or empty (cron not run yet).
    return await liveFallback(supabase);
  } catch (e: any) {
    return NextResponse.json({
      error: e?.message || (typeof e === "string" ? e : "Unknown API Error"),
      rawError: JSON.parse(JSON.stringify(e || {})),
    }, { status: 500 });
  }
}
