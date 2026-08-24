// Matches a "suspect" duplicate order (created under a raw Shiprocket id
// instead of the real Shopify order number - see channel_order_id fix in
// webhooks/shiprocket/route.ts) to its real counterpart, if there's exactly
// one unambiguous candidate. Pure/no I/O so it's cheaply testable; the
// caller (api/sync/heal) does the actual DB reassignment and delete.

export interface DedupOrder {
  id: string;
  shopify_order_id: string | null;
  ordered_at: string | null;
  line_items: any;
}

export function itemNames(lineItems: any): Set<string> {
  const names = Array.isArray(lineItems)
    ? lineItems.map((l: any) => String(l?.name || l?.title || "").trim().toLowerCase()).filter(Boolean)
    : [];
  return new Set(names);
}

export function isSuspectOrderId(shopifyOrderId: string | null | undefined): boolean {
  // A real Shopify order id/number is always digits. Anything else (a raw
  // Shiprocket internal id, a hex fragment, a cart token) is suspect.
  return !!shopifyOrderId && /\D/.test(shopifyOrderId);
}

/**
 * Returns the single unambiguous merge target for `suspect` among `clean`
 * candidates (same-customer, numeric-id orders), or null when there are
 * zero or multiple matches - callers must never guess in the ambiguous case.
 */
export function findMergeCandidate(suspect: DedupOrder, clean: DedupOrder[]): DedupOrder | null {
  const suspectTime = suspect.ordered_at ? new Date(suspect.ordered_at).getTime() : null;
  if (suspectTime === null) return null;
  const suspectItems = itemNames(suspect.line_items);

  const candidates = clean.filter(c => {
    if (!c.ordered_at) return false;
    const hoursApart = Math.abs(new Date(c.ordered_at).getTime() - suspectTime) / 3_600_000;
    if (hoursApart > 72) return false;
    const cItems = itemNames(c.line_items);
    for (const name of suspectItems) if (cItems.has(name)) return true;
    return false;
  });

  return candidates.length === 1 ? candidates[0] : null;
}
