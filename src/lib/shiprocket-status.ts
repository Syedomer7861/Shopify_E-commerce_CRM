/**
 * Maps a raw Shiprocket courier status string (or numeric code) to this
 * CRM's delivery_status enum.
 *
 * Was previously duplicated three times (cron/shiprocket-sync,
 * sync/shiprocket, reconcile-ghost-transit) with the same flaw: a plain
 * `s.includes("delivered")` check, which also matches "Undelivered-EN-
 * ROUTE" - a failed delivery attempt, not a success - because "delivered"
 * is a substring of "undelivered". Confirmed live: a real order carried
 * exactly that raw status. Order matters here - failure/return states are
 * checked before the generic "delivered" check, not after.
 */
export function mapShiprocketStatus(status: string | number): string {
  const s = String(status).toLowerCase().trim();
  if (!s) return "pending";

  // Terminal cancellation - checked first, unambiguous.
  if (s.includes("cancel") || s === "8") return "failed";

  // RTO family - the package is coming back or has come back. Must be
  // checked before "delivered", since "rto delivered" (the return itself
  // completing) would otherwise match the delivered branch.
  if (
    s.includes("rto") ||
    s === "9" ||
    s.includes("reached back") ||
    s.includes("back at seller") ||
    s.includes("returned")
  ) {
    return "rto";
  }

  // A failed/undelivered delivery attempt. Must be checked before the
  // plain "delivered" check below - "undelivered" contains "delivered"
  // as a substring. The package is still with the courier for a retry,
  // so this is honestly "in_transit", not a final state.
  if (s.includes("undelivered") || s.includes("un-delivered") || s.includes("delivery failed") || s.includes("ndr")) {
    return "in_transit";
  }

  if (s.includes("delivered") || s === "7" || s === "10") return "delivered";

  if (s.includes("out for delivery") || s === "13") return "out_for_delivery";

  // Genuine movement - the shipment exists and is somewhere in the
  // courier's network. Broader than the original list (which only
  // recognized "shipped"/"transit"/status codes 6/12) - confirmed live
  // that real Shiprocket strings like "PICKED UP" and "REACHED AT
  // DESTINATION HUB" fell through to the "pending" default below, which
  // is actively misleading: "pending" means no shipment exists yet, but
  // these orders already have a real AWB moving through the network.
  if (
    s.includes("shipped") ||
    s === "6" ||
    s === "12" ||
    s.includes("transit") ||
    s.includes("picked up") ||
    s.includes("reached at") ||
    s.includes("hub") ||
    s.includes("dispatch") ||
    s.includes("manifest")
  ) {
    return "in_transit";
  }

  // Genuinely pre-shipment - courier hasn't taken custody yet.
  return "pending";
}
