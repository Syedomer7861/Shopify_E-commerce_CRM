/**
 * Field contacts: the shops, clinics and people the offline team visits.
 * Pure helpers (validation, cleaning) so scripts/check-field-contacts.mjs can
 * test them without a browser.
 */
import { normalizePhone } from "./phone-utils";

export const CONTACT_CATEGORIES = [
  "Retailer", "Distributor", "Wholesaler", "Pharmacy", "Clinic", "Doctor", "Hospital",
  "Gym / Fitness", "Salon / Spa", "Supermarket", "Corporate", "Individual", "Other",
] as const;

export const VISIT_PURPOSES = [
  "New outlet introduction", "Order collection", "Follow-up", "Payment collection",
  "Product demo / sampling", "Complaint / service", "Stock check", "Other",
] as const;

export const INTEREST = [
  { value: "hot", label: "Hot: ready to buy" },
  { value: "warm", label: "Warm: interested" },
  { value: "cold", label: "Cold: not now" },
] as const;

export const CONTACT_STATUSES = ["active", "customer", "not_interested", "closed"] as const;

export type ContactInput = {
  business_name: string; category: string; contact_person: string; designation: string;
  phone: string; whatsapp: string; whatsappSame: boolean; email: string;
  address: string; area: string; city: string; state: string; pincode: string;
  interest: string; products_interest: string; notes: string; marketing_consent: boolean;
};

export const EMPTY_CONTACT: ContactInput = {
  business_name: "", category: "", contact_person: "", designation: "",
  phone: "", whatsapp: "", whatsappSame: true, email: "",
  address: "", area: "", city: "", state: "", pincode: "",
  interest: "", products_interest: "", notes: "", marketing_consent: false,
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Field-level problems, keyed by field. Empty object = valid. */
export function contactErrors(c: ContactInput): Partial<Record<keyof ContactInput, string>> {
  const e: Partial<Record<keyof ContactInput, string>> = {};
  if (!c.business_name.trim()) e.business_name = "Enter the shop or business name";
  if (!c.contact_person.trim()) e.contact_person = "Enter who you met";
  const phone = normalizePhone(c.phone);
  if (!phone) e.phone = "Enter a mobile number";
  else if (phone.length < 10) e.phone = "Mobile number needs 10 digits";
  if (!c.whatsappSame && c.whatsapp.trim() && normalizePhone(c.whatsapp).length < 10) e.whatsapp = "WhatsApp number needs 10 digits";
  if (c.email.trim() && !EMAIL.test(c.email.trim())) e.email = "That email doesn't look right";
  if (c.pincode.trim() && !/^[A-Za-z0-9 -]{3,10}$/.test(c.pincode.trim())) e.pincode = "Check the PIN code";
  return e;
}

const clean = (s: string, max: number) => (s.trim() ? s.trim().replace(/\s+/g, " ").slice(0, max) : null);

/** The row written to field_contacts (owner and org are set by the database / caller). */
export function contactRow(c: ContactInput) {
  const phone = normalizePhone(c.phone) || null;
  const whatsapp = c.whatsappSame ? phone : normalizePhone(c.whatsapp) || null;
  return {
    business_name: clean(c.business_name, 200)!,
    category: clean(c.category, 60),
    contact_person: clean(c.contact_person, 120),
    designation: clean(c.designation, 80),
    phone, whatsapp,
    email: c.email.trim() ? c.email.trim().toLowerCase().slice(0, 200) : null,
    address: c.address.trim() ? c.address.trim().slice(0, 500) : null,
    area: clean(c.area, 120), city: clean(c.city, 80), state: clean(c.state, 80),
    pincode: clean(c.pincode, 10),
    interest: ["hot", "warm", "cold"].includes(c.interest) ? c.interest : null,
    products_interest: clean(c.products_interest, 300),
    notes: c.notes.trim() ? c.notes.trim().slice(0, 2000) : null,
    marketing_consent: c.marketing_consent ? "yes" : "no",
  };
}

/** Back from a stored row to the form (editing / picking an existing contact). */
export function contactInput(r: Record<string, unknown>): ContactInput {
  const s = (k: string) => (r[k] == null ? "" : String(r[k]));
  return {
    ...EMPTY_CONTACT,
    business_name: s("business_name"), category: s("category"), contact_person: s("contact_person"), designation: s("designation"),
    phone: s("phone"), whatsapp: s("whatsapp"), whatsappSame: !r.whatsapp || r.whatsapp === r.phone, email: s("email"),
    address: s("address"), area: s("area"), city: s("city"), state: s("state"), pincode: s("pincode"),
    interest: s("interest"), products_interest: s("products_interest"), notes: s("notes"),
    marketing_consent: r.marketing_consent === "yes",
  };
}

/** wa.me link for a 10-digit Indian number (or a longer international one). */
export const waLink = (n: string | null | undefined) => (n ? `https://wa.me/${n.length === 10 ? `91${n}` : n}` : null);
