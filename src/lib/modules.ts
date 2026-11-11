import { CheckCircle2, IndianRupee, LifeBuoy, Target, MapPin, GitBranch, type LucideIcon } from "lucide-react";
import type { Profile } from "@/types";
import { can } from "./access";

/**
 * Registry of the permission-engine modules. The sidebar renders from this:
 * a module shows when the profile holds `view` on any of its `perms` and the
 * org hasn't switched it off. Adding a module = one entry here + its page.
 * (The older pages still use the nav arrays in Sidebar.tsx and nav_modules.)
 */
export type AppModule = { key: string; label: string; href: string; icon: LucideIcon; perms: string[]; blurb: string };

export const APP_MODULES: AppModule[] = [
  { key: "approvals", label: "Approvals", href: "/approvals", icon: CheckCircle2, perms: ["approvals", "expenses", "work"], blurb: "Requests waiting on a decision" },
  { key: "finance", label: "Finance", href: "/finance", icon: IndianRupee, perms: ["expenses", "vendors", "invoices"], blurb: "Expense claims, vendors, invoices" },
  { key: "service-desk", label: "Service Desk", href: "/service-desk", icon: LifeBuoy, perms: ["tickets"], blurb: "Internal tickets with SLA clocks" },
  { key: "leads", label: "Leads & Deals", href: "/leads", icon: Target, perms: ["leads", "deals"], blurb: "Pipeline from first contact to won" },
  { key: "field", label: "Field Visits", href: "/field", icon: MapPin, perms: ["visits"], blurb: "Planned visits and check-ins" },
  { key: "rules", label: "Rules", href: "/workflows/rules", icon: GitBranch, perms: ["workflows"], blurb: "When X happens, do Y" },
];

/** Org-level switches offered on the Organisation page (permission module keys). */
export const SWITCHABLE_MODULES: { key: string; label: string }[] = [
  { key: "expenses", label: "Expenses" }, { key: "vendors", label: "Vendors" }, { key: "invoices", label: "Invoices" },
  { key: "tickets", label: "Service Desk" }, { key: "leads", label: "Leads" }, { key: "deals", label: "Deals" },
  { key: "visits", label: "Field Visits" }, { key: "approvals", label: "Approvals" },
];

export function visibleModules(profile: Partial<Profile> | null | undefined) {
  // role_grants is undefined until 20261111c is applied - show nothing rather than links to empty pages.
  if (!profile || profile.role_grants === undefined) return [];
  return APP_MODULES.filter(m => m.perms.some(p => can(profile, p, "view") !== null));
}
