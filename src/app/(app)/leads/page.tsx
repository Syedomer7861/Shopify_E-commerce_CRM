"use client";
import { ModulePage } from "@/components/records/ModulePage";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase";
import { money, day, type RecordsConfig, type RecordRow } from "@/components/records/RecordsModule";

// Turns a qualified lead into a deal linked to it, then marks the lead converted.
async function convertToDeal(lead: RecordRow, reload: () => void) {
  if (!window.confirm(`Create a deal from ${lead.name}?`)) return;
  const supabase = createClient();
  const { error } = await supabase.from("deals").insert({
    id: crypto.randomUUID(), lead_id: lead.id, owner_id: lead.owner_id,
    title: lead.company ? `${lead.company}: ${lead.name}` : lead.name,
    value: lead.est_value ?? 0, status: "open",
  });
  if (error) return toast.error(error.message);
  const { error: upd } = await supabase.from("leads").update({ status: "converted" }).eq("id", lead.id);
  if (upd) toast.error(upd.message);
  else toast.success("Deal created - see the Deals tab");
  reload();
}

const leads: RecordsConfig = {
  table: "leads", module: "leads", noun: "lead", ownerCol: "owner_id", editable: true,
  dedupe: ["email", "phone"],
  rowActions: (row, reload) => row.status === "converted" || row.status === "lost" ? null : (
    <button onClick={() => convertToDeal(row, reload)} className="px-2.5 py-1.5 rounded-lg bg-[#1c1c1c] text-white text-[10px] font-bold">Convert to deal</button>
  ),
  columns: [
    { key: "name", label: "Lead" },
    { key: "company", label: "Company" },
    { key: "phone", label: "Phone" },
    { key: "source", label: "Source" },
    { key: "est_value", label: "Est. value", format: money },
  ],
  statuses: ["new", "contacted", "qualified", "converted", "lost"],
  fields: [
    { key: "name", label: "Name", required: true },
    { key: "company", label: "Company" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "source", label: "Source", type: "select", options: ["Website", "Referral", "Walk-in", "Call", "Social", "Event", "Other"] },
    { key: "est_value", label: "Estimated value (₹)", type: "number" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  samples: [
    { name: "Priya Nair", company: "Nair Ayurveda", phone: "98XXXXXX31", source: "Referral", est_value: 75000, status: "qualified" },
    { name: "Arjun Mehta", company: "FitBox Studio", phone: "98XXXXXX47", source: "Website", est_value: 30000, status: "contacted" },
    { name: "Sana Khan", company: "Bloom Organics", phone: "98XXXXXX58", source: "Event", est_value: 120000, status: "new" },
  ],
};

const deals: RecordsConfig = {
  table: "deals", module: "deals", noun: "deal", ownerCol: "owner_id", editable: true,
  columns: [
    { key: "title", label: "Deal" },
    { key: "value", label: "Value", format: money },
    { key: "expected_close", label: "Expected close", format: day },
  ],
  statuses: ["open", "proposal", "negotiation", "won", "lost"],
  fields: [
    { key: "title", label: "Deal title", required: true },
    { key: "value", label: "Value (₹)", type: "number", required: true },
    { key: "expected_close", label: "Expected close", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  samples: [
    { title: "Nair Ayurveda: quarterly supply", value: 75000, expected_close: new Date(Date.now() + 10 * 86_400_000).toISOString(), status: "proposal" },
    { title: "Bloom Organics: launch order", value: 120000, expected_close: new Date(Date.now() + 25 * 86_400_000).toISOString(), status: "negotiation" },
    { title: "City Pharmacy: annual contract", value: 210000, expected_close: new Date(Date.now() - 6 * 86_400_000).toISOString(), status: "won" },
  ],
};

export default function LeadsPage() {
  return (
    <ModulePage
      title="Leads & Deals"
      subtitle="You see your own pipeline; managers see their team's. Separate from the customer call queue."
      tabs={[{ label: "Leads", config: leads }, { label: "Deals", config: deals }]}
    />
  );
}
