"use client";
import { ModulePage } from "@/components/records/ModulePage";
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
  samples: [
    { category: "Travel", amount: 1850, description: "Cab to distributor meeting", expense_date: daysFromNow(-3), status: "Pending" },
    { category: "Software", amount: 4999, description: "Design tool, annual plan", expense_date: daysFromNow(-9), status: "Approved" },
    { category: "Food", amount: 640, description: "Team lunch during stock audit", expense_date: daysFromNow(-12), status: "Rejected" },
  ],
};

const vendors: RecordsConfig = {
  table: "vendors", module: "vendors", noun: "vendor", ownerCol: "created_by", ownerLabel: "Added by",
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
  samples: [
    { name: "Shree Packaging Co.", contact_name: "Ramesh Gupta", phone: "98XXXXXX10", tax_id: "27ABCDE1234F1Z5", status: "active" },
    { name: "Swift Courier Services", contact_name: "Accounts desk", phone: "98XXXXXX22", tax_id: "07FGHIJ5678K1Z2", status: "active" },
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
  samples: [
    { number: "INV-0042", direction: "receivable", party_name: "Wellness Mart", amount: 48500, due_date: daysFromNow(7), status: "sent" },
    { number: "BILL-0117", direction: "payable", party_name: "Shree Packaging Co.", amount: 12300, due_date: daysFromNow(-4), status: "overdue" },
    { number: "INV-0039", direction: "receivable", party_name: "City Pharmacy", amount: 22750, due_date: daysFromNow(-15), status: "paid" },
  ],
};

export default function FinancePage() {
  return (
    <ModulePage
      title="Finance"
      subtitle="Expense claims go to the claimant's manager for approval. Vendors and invoices are kept by the finance team."
      tabs={[{ label: "Expense claims", config: expenses }, { label: "Invoices", config: invoices }, { label: "Vendors", config: vendors }]}
    />
  );
}
