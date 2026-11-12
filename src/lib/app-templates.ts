import type { RecordField } from "@/components/records/RecordsModule";

/** What an admin defines on the Apps page; stored as one row of custom_modules. */
export type AppDefinition = {
  label: string;
  noun: string;
  description: string;
  visibility: "everyone" | "own";
  statuses: string[];
  fields: RecordField[];
};

export type CustomModule = AppDefinition & { id: string; key: string; is_active: boolean };

export const FIELD_TYPES: { value: NonNullable<RecordField["type"]>; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Choice list" },
  { value: "person", label: "Team member" },
];

/** "Asset Register" -> "asset-register" (module key) or "asset_register" (field key). */
export const slug = (text: string, sep: "-" | "_" = "-") =>
  text.toLowerCase().trim().replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^\\${sep}+|\\${sep}+$`, "g"), "").slice(0, 40);

const f = (label: string, type: RecordField["type"] = "text", extra: Partial<RecordField> = {}): RecordField =>
  ({ key: slug(label, "_"), label, type, ...extra });

/** Starting points so an organisation of any kind has something useful in one tap. Everything is editable after. */
export const APP_TEMPLATES: AppDefinition[] = [
  {
    label: "Asset Register", noun: "asset", visibility: "everyone",
    description: "Laptops, phones, vehicles, equipment: who has what and in what condition.",
    statuses: ["in_use", "in_stock", "under_repair", "retired"],
    fields: [f("Asset name", "text", { required: true }), f("Category", "select", { options: ["Laptop", "Phone", "Vehicle", "Furniture", "Equipment", "Other"] }), f("Serial number"), f("Assigned to", "person"), f("Purchase date", "date"), f("Value", "number"), f("Notes", "textarea")],
  },
  {
    label: "Purchase Requests", noun: "request", visibility: "own",
    description: "Staff ask for something to be bought; each person sees their own requests.",
    statuses: ["requested", "approved", "ordered", "received", "rejected"],
    fields: [f("Item", "text", { required: true }), f("Quantity", "number", { required: true }), f("Estimated cost", "number"), f("Needed by", "date"), f("Reason", "textarea")],
  },
  {
    label: "Visitor Log", noun: "visitor", visibility: "everyone",
    description: "Who came in, to meet whom, and when they left.",
    statuses: ["expected", "checked_in", "checked_out"],
    fields: [f("Visitor name", "text", { required: true }), f("Company"), f("Phone"), f("Meeting with", "person"), f("Visit date", "date"), f("Purpose", "textarea")],
  },
  {
    label: "Contracts", noun: "contract", visibility: "everyone",
    description: "Agreements with clients and suppliers, with renewal dates.",
    statuses: ["draft", "active", "expiring", "expired", "terminated"],
    fields: [f("Title", "text", { required: true }), f("Party", "text", { required: true }), f("Start date", "date"), f("End date", "date"), f("Value", "number"), f("Notes", "textarea")],
  },
  {
    label: "Training Records", noun: "training", visibility: "everyone",
    description: "Courses and certifications completed by the team.",
    statuses: ["planned", "in_progress", "completed", "expired"],
    fields: [f("Course", "text", { required: true }), f("Employee", "person", { required: true }), f("Provider"), f("Completed on", "date"), f("Valid until", "date"), f("Notes", "textarea")],
  },
  {
    label: "Complaints", noun: "complaint", visibility: "everyone",
    description: "Issues raised by clients or the public, tracked to resolution.",
    statuses: ["new", "investigating", "resolved", "closed"],
    fields: [f("Raised by", "text", { required: true }), f("Contact"), f("Category", "select", { options: ["Service", "Product", "Billing", "Staff", "Other"] }), f("Received on", "date"), f("Details", "textarea", { required: true }), f("Resolution", "textarea")],
  },
  {
    label: "Inventory", noun: "item", visibility: "everyone",
    description: "Stock on hand with reorder levels.",
    statuses: ["in_stock", "low", "out_of_stock", "discontinued"],
    fields: [f("Item name", "text", { required: true }), f("SKU"), f("Quantity", "number", { required: true }), f("Reorder level", "number"), f("Location"), f("Unit cost", "number")],
  },
  {
    label: "Projects", noun: "project", visibility: "everyone",
    description: "Client or internal projects with dates and budget.",
    statuses: ["planned", "active", "on_hold", "completed", "cancelled"],
    fields: [f("Project name", "text", { required: true }), f("Client"), f("Start date", "date"), f("Due date", "date"), f("Budget", "number"), f("Summary", "textarea")],
  },
];
