import { SupabaseClient } from "@supabase/supabase-js";

export interface LogisticsRecommendation {
  best_carrier: string;
  rto_probability: number; // 0-100
  reason: string;
}

/**
 * Provides logistics intelligence based on pincode historical performance.
 */
export async function getLogisticsIntelligence(
  supabase: SupabaseClient,
  pincode: string
): Promise<LogisticsRecommendation> {
  // 1. Fetch historical metrics for this pincode
  const { data: metrics } = await supabase
    .from("pincode_metrics")
    .select("*")
    .eq("pincode", pincode)
    .maybeSingle();

  if (!metrics) {
    return {
      best_carrier: "Standard (Delhivery/XpressBees)",
      rto_probability: 25,
      reason: "No historical data for this pincode yet. Proceed with standard verification."
    };
  }

  const rtoRate = metrics.avg_rto_rate || 0;
  
  let reason = `Historical RTO rate for this pincode is ${rtoRate}%.`;
  if (rtoRate > 40) {
    reason += " CRITICAL: High return rate area.";
  } else if (rtoRate < 10) {
    reason += " SAFE: High delivery success area.";
  }

  return {
    best_carrier: metrics.best_carrier || "Auto-Select",
    rto_probability: rtoRate,
    reason: `${reason} Best performer: ${metrics.best_carrier || 'N/A'}`
  };
}
