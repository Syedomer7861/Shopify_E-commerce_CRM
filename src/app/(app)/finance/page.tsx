"use client";
import { ModulePage } from "@/components/records/ModulePage";
import { FinanceOverview } from "@/components/records/DeptOverviews";
import { money, day, type RecordsConfig } from "@/components/records/RecordsModule";

const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const expenses: RecordsConfig = {
  table: "expenses", module: "expenses", noun: "expense claim", ownerCol: "agent_id", ownerLabel: "Claimed by",
  columns: [
    { key: "category", label: "Category" },
    { key: "amount", label: "Amount", format: money },
    { key: "description", label: "Details" },
    { key: "expense_date", label: "Date", format: day },
  ],
  // No inline status: a claim is decided in Approvals, by someone other than the claimant.
  fields: [
    { key: "category", label: "Category", type: "select", required: true, options: ["Travel", "Food", "Supplies", "Software", "Marketing", "Other"] },
    { key: "amount", label: "Amount (₹)", type: "number", required: true },
    { key: "expense_date", label: "Date", type: "date" },
    { key: "description", label: "Details", type: "textarea" },
  ],
};

const vendors: RecordsConfig = {
  table: "vendors", module: "vendors", noun: "vendor", ownerCol: "created_by", ownerLabel: "Added by", editable: true, dedupe: ["name"],
  columns: [
    { key: "name", label: "Vendor" },
    { key: "contact_name", label: "Contact" },
    { key: "phone", label: "Phone" },
    { key: "tax_id", label: "GSTIN / Tax ID" },
  ],
  fields: [
    { key: "name", label: "Vendor name", required: true },
    { key: "contact_name", label: "Contact person" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "tax_id", label: "GSTIN / Tax ID" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

const invoices: RecordsConfig = {
  table: "invoices", module: "invoices", noun: "invoice", ownerCol: "created_by", ownerLabel: "Added by",
  columns: [
    { key: "number", label: "Number" },
    { key: "direction", label: "Type" },
    { key: "party_name", label: "Party" },
    { key: "amount", label: "Amount", format: money },
    { key: "due_date", label: "Due", format: day },
  ],
  statuses: ["draft", "sent", "paid", "overdue", "cancelled"],
  fields: [
    { key: "number", label: "Invoice number", required: true },
    { key: "direction", label: "Type", type: "select", required: true, options: ["payable", "receivable"] },
    { key: "party_name", label: "Vendor / customer name", required: true },
    { key: "amount", label: "Amount (₹)", type: "number", required: true },
    { key: "issue_date", label: "Issue date", type: "date" },
    { key: "due_date", label: "Due date", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

export default function FinancePage() {
  return (
    <ModulePage
      title="Finance"
      subtitle="Expense claims go to the claimant's manager for approval. Vendors and invoices are kept by the finance team."
      overview={<FinanceOverview />}
      tabs={[{ label: "Expense claims", config: expenses }, { label: "Invoices", config: invoices }, { label: "Vendors", config: vendors }]}
    />
  );
}
