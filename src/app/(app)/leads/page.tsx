"use client";
import { ModulePage } from "@/components/records/ModulePage";
import { SalesOverview } from "@/components/records/DeptOverviews";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase";
import { money, day, type RecordsConfig, type RecordRow } from "@/components/records/RecordsModule";

// Days since the lead came in. A "new" lead nobody has contacted for 2+ days is flagged.
function leadAge(created: any, row: RecordRow) {
  if (!created) return "—";
  const days = Math.floor((Date.now() - new Date(created).getTime()) / 86_400_000);
  const stale = row.status === "new" && days >= 2;
  return <span className={stale ? "font-bold text-red-600" : "text-gray-500"}>{days}d{stale ? " · not contacted" : ""}</span>;
}

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
    { key: "created_at", label: "Age", format: leadAge },
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
};

export default function LeadsPage() {
  return (
    <ModulePage
      title="Leads & Deals"
      subtitle="You see your own pipeline; managers see their team's. Separate from the customer call queue."
      overview={<SalesOverview />}
      tabs={[{ label: "Leads", config: leads }, { label: "Deals", config: deals }]}
    />
  );
}
