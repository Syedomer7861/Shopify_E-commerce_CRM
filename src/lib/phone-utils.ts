// Single source of truth for customer.phone normalization. Every write path
// (Shopify sync, Shiprocket sync, Excel import, manual Add Customer) must
// route through this - four independent implementations previously
// disagreed on stripping "+"/"91", so the same real number ("+917667724595"
// vs "7667724595") produced two different string values and the
// onConflict:"phone" upsert never recognized them as one customer.
//
// Strategy: strip all non-digits, then keep only the last 10 (a full E.164
// Indian mobile is always exactly 10 digits after the country code, so
// trailing-10 is prefix-agnostic - handles "91", "+91", "0091", or no
// prefix at all the same way). Numbers with fewer than 10 digits are
// returned as-is (digits only) rather than guessed at.
export function normalizePhone(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  const digits = String(raw).replace(/[^\d]/g, "");
  return digits.length > 10 ? digits.slice(digits.length - 10) : digits;
}
