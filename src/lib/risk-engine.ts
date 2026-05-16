import { SupabaseClient } from "@supabase/supabase-js";

export interface RiskAnalysis {
  score: number; // 0-100 (High is bad)
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reasons: string[];
  recommendation: string;
}

/**
 * Predicts the likelihood of an order returning (RTO) based on historical and real-time data.
 */
export async function analyzeRTORisk(
  supabase: SupabaseClient,
  customerId: string,
  orderData: any
): Promise<RiskAnalysis> {
  const reasons: string[] = [];
  let score = 0;

  // 1. Check Customer History (The most accurate predictor)
  const { data: customer } = await supabase
    .from("customers")
    .select("rto_count, total_orders, rto_flag, segment")
    .eq("id", customerId)
    .maybeSingle();

  if (customer?.rto_flag) {
    score += 40;
    reasons.push("Previous RTO history detected for this customer.");
  }
  
  if (customer?.rto_count && customer.rto_count > 1) {
    score += 20;
    reasons.push(`Customer has ${customer.rto_count} prior returns.`);
  }

  if (customer?.segment === 'risky_returner') {
    score += 30;
    reasons.push("Customer is tagged as a 'Risky Returner'.");
  }

  // 2. Address Validation (Derived from Shiprocket's own intelligence)
  const addrScore = Number(orderData.extra_info?.address_score || orderData.address_score || 1);
  if (addrScore > 0 && addrScore < 0.6) {
    score += 25;
    reasons.push("Shiprocket Address Score is critically low.");
  }

  // 3. Payment Method Risk
  const isCOD = String(orderData.payment_method || "").toLowerCase().includes("cod") || 
                String(orderData.payment_gateway || "").toLowerCase().includes("cod");
  
  if (isCOD) {
    score += 15;
    reasons.push("COD payment (No financial commitment yet).");
  }

  // 4. High Value vs First Time
  const total = Number(orderData.total || orderData.total_price || 0);
  if ((customer?.total_orders || 0) === 0 && total > 3000) {
    score += 20;
    reasons.push("First-time customer with a high-value order (>₹3k).");
  }

  // 5. Blacklisted Keywords in Address
  const address = String(orderData.billing_address || orderData.address || "").toLowerCase();
  const suspiciousKeywords = ["test", "dummy", "fake", "123", "abcd", "nil", "none"];
  if (suspiciousKeywords.some(kw => address.includes(kw))) {
    score += 50;
    reasons.push("Suspicious keywords detected in delivery address.");
  }

  // Determine Level (Normalized to 100 max)
  const finalScore = Math.min(score, 100);
  let level: RiskAnalysis["level"] = "LOW";
  
  if (finalScore >= 80) level = "CRITICAL";
  else if (finalScore >= 55) level = "HIGH";
  else if (finalScore >= 30) level = "MEDIUM";

  const recommendation = level === "CRITICAL" 
    ? "IMMEDIATE ACTION: Do not ship. High probability of fraud or fake order." 
    : level === "HIGH" 
    ? "MANDATORY CALL: Verify address and intent before shipping." 
    : level === "MEDIUM" 
    ? "PRECAUTION: Suggest prepaid conversion on WhatsApp."
    : "Safe to fulfill.";

  return { score: finalScore, level, reasons, recommendation };
}
