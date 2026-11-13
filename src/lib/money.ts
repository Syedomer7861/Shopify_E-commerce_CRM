// Prices are stored as whole minor units (paise for INR) to avoid float errors.

export function formatMinor(minor: number | null | undefined, currency = "INR") {
  if (minor == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
}

/** "1499" or "1499.50" to 149900 / 149950. Returns null for anything else (negatives, 3 decimals, text). */
export function toMinor(input: string): number | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
