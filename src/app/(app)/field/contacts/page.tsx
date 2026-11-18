"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ArrowLeft, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { ModulePage } from "@/components/records/ModulePage";
import type { RecordsConfig, RecordRow } from "@/components/records/RecordsModule";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { can } from "@/lib/access";
import { CONTACT_CATEGORIES, CONTACT_STATUSES, waLink } from "@/lib/field-contacts";

const when = (v: string | null) => (v ? new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
const INTEREST_STYLE: Record<string, string> = {
  hot: "bg-[var(--accent)] text-[#1c1c1c]", warm: "bg-[#1c1c1c] text-white", cold: "bg-[#f0f0ec] text-[#55554f]",
};

/** Everyone the offline team visits, with contact details for follow-up and marketing. */
export default function FieldContactsPage() {
  const { profile } = useCurrentProfile();
  const canLead = !!profile && can(profile, "leads", "create") !== null;
  const icon = "inline-flex items-center justify-center w-7 h-7 rounded-lg border border-[#ebece6] text-[#1c1c1c] hover:border-[#1c1c1c] align-middle";

  async function makeLead(row: RecordRow) {
    if (!profile) return;
    const { error } = await createClient().from("leads").insert({
      id: crypto.randomUUID(), owner_id: profile.id, status: "new", source: "Field visit",
      name: row.contact_person || row.business_name, company: row.business_name,
      phone: row.phone, email: row.email,
      notes: [row.category, row.area || row.city, row.products_interest && `Interested in: ${row.products_interest}`, row.notes].filter(Boolean).join(" · ") || null,
    });
    if (error) toast.error(error.message);
    else toast.success(`${row.business_name} added to Leads`);
  }

  const contacts: RecordsConfig = {
    table: "field_contacts", module: "field_contacts", noun: "contact", ownerCol: "owner_id", ownerLabel: "Added by",
    columns: [
      { key: "business_name", label: "Business", format: (v, r) => (
        <span className="block min-w-[140px]"><span className="font-semibold">{v}</span>{r.category && <span className="block text-[10px] text-[#9a9a94]">{r.category}</span>}</span>
      ) },
      { key: "contact_person", label: "Person", format: (v, r) => v ? <span>{v}{r.designation && <span className="block text-[10px] text-[#9a9a94]">{r.designation}</span>}</span> : "—" },
      { key: "phone", label: "Mobile", format: v => v || "—" },
      { key: "email", label: "Email", format: v => v || "—" },
      { key: "area", label: "Area", format: (v, r) => [v, r.city].filter(Boolean).join(", ") || "—" },
      { key: "interest", label: "Interest", format: v => v ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${INTEREST_STYLE[v] || ""}`}>{v}</span> : "—" },
      { key: "marketing_consent", label: "Offers OK", format: v => v === "yes" ? <span className="inline-flex items-center gap-1 font-semibold"><ShieldCheck className="w-3.5 h-3.5" /> Yes</span> : <span className="text-[#9a9a94]">No</span> },
      { key: "visit_count", label: "Visits", format: v => <span className="tabular-nums">{v ?? 0}</span> },
      { key: "last_visit_at", label: "Last visit", format: when },
    ],
    fields: [
      { key: "business_name", label: "Shop / business name", required: true },
      { key: "category", label: "Type", type: "select", options: [...CONTACT_CATEGORIES] },
      { key: "contact_person", label: "Person you met" },
      { key: "designation", label: "Their role" },
      { key: "phone", label: "Mobile" },
      { key: "whatsapp", label: "WhatsApp (if different)" },
      { key: "email", label: "Email" },
      { key: "address", label: "Address", type: "textarea" },
      { key: "area", label: "Area / locality" },
      { key: "city", label: "City" },
      { key: "state", label: "State" },
      { key: "pincode", label: "PIN code" },
      { key: "interest", label: "Interest", type: "select", options: ["hot", "warm", "cold"] },
      { key: "products_interest", label: "Products they're interested in" },
      { key: "marketing_consent", label: "Agreed to get offers (WhatsApp, SMS, email)?", type: "select", options: ["yes", "no"] },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    statuses: [...CONTACT_STATUSES],
    board: true,
    editable: true,
    dedupe: ["phone", "email"],
    rowActions: row => (
      <span className="inline-flex gap-1.5">
        {row.phone && <a href={`tel:${row.phone}`} aria-label={`Call ${row.business_name}`} title="Call" className={icon}><Phone className="w-3.5 h-3.5" /></a>}
        {waLink(row.whatsapp || row.phone) && (
          <a href={waLink(row.whatsapp || row.phone)!} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${row.business_name}`} title="WhatsApp" className={icon}><MessageCircle className="w-3.5 h-3.5" /></a>
        )}
        {canLead && row.status !== "customer" && (
          <button onClick={() => makeLead(row)} className="px-2.5 py-1.5 rounded-lg bg-[#1c1c1c] text-white text-[10px] font-bold align-middle">Make lead</button>
        )}
      </span>
    ),
  };

  return (
    <ModulePage
      title="Field contacts"
      subtitle="Everyone your offline team has visited, with their contact details. New visits add and update contacts here automatically."
      overview={<ContactsOverview />}
      tabs={[{ label: "Contacts", config: contacts }]}
    />
  );
}

function ContactsOverview() {
  const supabase = useMemo(() => createClient(), []);
  const [n, setN] = useState<Record<string, number | null>>({});
  useEffect(() => {
    const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
    const count = (f?: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => (f ? f(base()) : base()).then(r => (r.error ? null : r.count ?? 0));
    const base = () => supabase.from("field_contacts").select("id", { count: "exact", head: true });
    Promise.all([
      count(), count(q => q.eq("marketing_consent", "yes")), count(q => q.eq("interest", "hot")),
      count(q => q.gte("created_at", month.toISOString())), count(q => q.eq("status", "customer")),
    ]).then(([total, consent, hot, added, customers]) => setN({ total, consent, hot, added, customers }));
  }, [supabase]);
  const tile = (label: string, v: number | null | undefined, sub?: string) => (
    <div className="card p-4">
      <div className="text-[11px] text-[#9a9a94]">{label}</div>
      <div className="text-2xl font-bold tabular-nums text-[#1c1c1c]">{v ?? "—"}</div>
      {sub && <div className="text-[10px] text-[#9a9a94]">{sub}</div>}
    </div>
  );
  return (
    <div className="mb-5">
      <Link href="/field" className="inline-flex items-center gap-1 text-xs font-semibold text-[#6b6b67] hover:text-[#1c1c1c] mb-3"><ArrowLeft className="w-3.5 h-3.5" /> Field visits</Link>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {tile("Contacts", n.total)}
        {tile("Agreed to offers", n.consent, n.total ? `${Math.round(((n.consent ?? 0) / n.total) * 100)}% of contacts` : undefined)}
        {tile("Hot", n.hot, "ready to buy")}
        {tile("Added this month", n.added)}
        {tile("Customers", n.customers)}
      </div>
    </div>
  );
}
