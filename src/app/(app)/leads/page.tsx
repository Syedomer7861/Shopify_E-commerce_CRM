"use client";
import { ModulePage } from "@/components/records/ModulePage";
import { money, day, type RecordsConfig } from "@/components/records/RecordsModule";

const leads: RecordsConfig = {
  table: "leads", module: "leads", noun: "lead", ownerCol: "owner_id",
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
};

const deals: RecordsConfig = {
  table: "deals", module: "deals", noun: "deal", ownerCol: "owner_id",
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
      tabs={[{ label: "Leads", config: leads }, { label: "Deals", config: deals }]}
    />
  );
}
