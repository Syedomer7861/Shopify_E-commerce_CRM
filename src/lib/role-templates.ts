import {
  Eye, Headphones, IndianRupee, LifeBuoy, MapPin, Megaphone, ShieldCheck, Briefcase, UserCog, Users, Code2, type LucideIcon,
} from "lucide-react";
import type { UserPermissions } from "@/types";
import { PERMISSION_MODULES, SCOPE_LABELS, type Grants, type Scope } from "./access";

/**
 * Ready-made roles. A template fills the Roles form (name, extra
 * permissions, menu pages, access matrix); the admin can change anything
 * before saving. `info` also labels existing roles with the same name, so
 * the Roles and Team pages can say what a role is for.
 */
export type RoleTemplate = {
  key: string; label: string; icon: LucideIcon;
  /** One line: who this is for. */
  info: string;
  /** What they do with it, shown under the info. */
  covers: string;
  permissions: UserPermissions;
  /** Main-menu pages; null = every page. */
  nav: string[] | null;
  grants: Grants;
};

const NONE: UserPermissions = {
  view_analytics: false, can_import: false, can_delete: false, manage_team: false, manage_orders: false,
  manage_customers: false, send_whatsapp: false, audit_tasks: false, manage_automations: false, manage_workspaces: false,
};
const flags = (on: (keyof UserPermissions)[]): UserPermissions => ({ ...NONE, ...Object.fromEntries(on.map(k => [k, true])) });
const BASE_NAV = ["dashboard", "my-hub", "chat", "calendar", "performance"];
// Everyone can raise a ticket, claim expenses and work on tasks given to them.
const SELF = {
  tickets: { create: "own", view: "own" },
  expenses: { create: "own", view: "own" },
  work: { create: "own", view: "assigned", edit: "assigned" },
} satisfies Grants;

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: "field", label: "Field executive", icon: MapPin,
    info: "Staff who visit shops, clinics or clients on the road.",
    covers: "Plan visits, check in with photo and GPS, save the contact's details, share live location. Sees only their own records.",
    permissions: NONE, nav: BASE_NAV,
    grants: { ...SELF, visits: { view: "own", create: "own", edit: "own" }, field_contacts: { view: "own", create: "own", edit: "own" }, leads: { view: "own", create: "own", edit: "own" } },
  },
  {
    key: "field_manager", label: "Field manager", icon: Users,
    info: "Leads a field team or an area.",
    covers: "Sees the team's live map, visits and contacts, exports contacts, approves the team's expenses.",
    permissions: flags(["view_analytics", "audit_tasks"]), nav: [...BASE_NAV, "tasks", "reports"],
    grants: {
      ...SELF, visits: { view: "team", create: "own", edit: "team" },
      field_contacts: { view: "team", create: "own", edit: "team", export: "team" },
      leads: { view: "team", create: "own", edit: "team", assign: "team" },
      expenses: { create: "own", view: "team", approve: "team" }, approvals: { view: "team", approve: "team" },
      work: { create: "own", view: "team", edit: "team", assign: "team" }, reports: { view: "organisation" },
    },
  },
  {
    key: "agent", label: "Sales / call-centre agent", icon: Headphones,
    info: "Works the call queue and talks to customers.",
    covers: "Customers, orders and their own leads and deals; sends WhatsApp messages.",
    permissions: flags(["manage_customers", "manage_orders", "send_whatsapp"]), nav: [...BASE_NAV, "tasks", "customers", "orders"],
    grants: { ...SELF, customers: { view: "organisation", create: "organisation", edit: "organisation" }, orders: { view: "organisation", edit: "organisation" }, leads: { view: "own", create: "own", edit: "own" }, deals: { view: "own", create: "own", edit: "own" } },
  },
  {
    key: "manager", label: "Operations manager", icon: Briefcase,
    info: "Runs a team day to day.",
    covers: "Team's leads, deals, visits and tasks; approvals, reports, automations and the team page.",
    permissions: flags(["view_analytics", "can_import", "manage_team", "manage_orders", "manage_customers", "send_whatsapp", "audit_tasks", "manage_automations", "manage_workspaces"]), nav: null,
    grants: {
      ...SELF, customers: { view: "organisation", create: "organisation", edit: "organisation", export: "organisation" },
      orders: { view: "organisation", edit: "organisation", export: "organisation" },
      leads: { view: "team", create: "own", edit: "team", assign: "team" }, deals: { view: "team", create: "own", edit: "team", assign: "team" },
      visits: { view: "team", create: "own", edit: "own" }, field_contacts: { view: "team", create: "own", edit: "own", export: "team" },
      approvals: { view: "team", approve: "team" }, expenses: { create: "own", view: "team", approve: "team" },
      work: { create: "own", view: "organisation", edit: "assigned", assign: "organisation", approve: "team", manage: "organisation" },
      reports: { view: "organisation" }, team: { view: "organisation", manage: "organisation" }, workflows: { view: "organisation", manage: "organisation" },
    },
  },
  {
    key: "hr", label: "HR", icon: UserCog,
    info: "Looks after people: attendance, payroll, documents.",
    covers: "HR pages and the team list; can see everyone's field visits for attendance checks.",
    permissions: flags(["view_analytics"]), nav: [...BASE_NAV, "hr", "team"],
    grants: { ...SELF, team: { view: "organisation" }, organisation: { view: "organisation" }, reports: { view: "organisation" }, visits: { view: "organisation" }, field_contacts: { view: "organisation" } },
  },
  {
    key: "marketing", label: "Marketing", icon: Megaphone,
    info: "Runs campaigns and content.",
    covers: "Campaigns, templates and every field contact (with export) for WhatsApp, SMS and email offers.",
    permissions: flags(["view_analytics", "manage_customers", "send_whatsapp"]), nav: [...BASE_NAV, "campaigns", "templates", "request-creative", "reports"],
    grants: { ...SELF, customers: { view: "organisation" }, field_contacts: { view: "organisation", export: "organisation" }, leads: { view: "organisation", create: "own", edit: "own" }, reports: { view: "organisation" }, work: { create: "own", view: "organisation", edit: "assigned", assign: "organisation" } },
  },
  {
    key: "finance", label: "Accounts / finance", icon: IndianRupee,
    info: "Handles money in and out.",
    covers: "Approves and exports expenses, manages vendors and invoices, sees reports.",
    permissions: flags(["view_analytics", "can_import"]), nav: [...BASE_NAV, "reports"],
    grants: { ...SELF, expenses: { create: "own", view: "organisation", approve: "organisation", export: "organisation" }, vendors: { view: "organisation", create: "organisation", edit: "organisation" }, invoices: { view: "organisation", create: "organisation", edit: "organisation", export: "organisation" }, approvals: { view: "organisation", approve: "organisation" }, reports: { view: "organisation", export: "organisation" } },
  },
  {
    key: "support", label: "Support desk", icon: LifeBuoy,
    info: "Answers internal requests and tickets.",
    covers: "Every Service Desk ticket: pick up, assign and resolve.",
    permissions: NONE, nav: [...BASE_NAV, "tasks"],
    grants: { ...SELF, tickets: { view: "organisation", create: "own", edit: "organisation", assign: "organisation" } },
  },
  {
    key: "viewer", label: "Read-only viewer", icon: Eye,
    info: "Owners, auditors or advisers who only look.",
    covers: "Sees customers, orders, leads, deals, visits and reports across the business; changes nothing.",
    permissions: flags(["view_analytics"]), nav: [...BASE_NAV, "reports"],
    grants: { customers: { view: "organisation" }, orders: { view: "organisation" }, leads: { view: "organisation" }, deals: { view: "organisation" }, visits: { view: "organisation" }, field_contacts: { view: "organisation" }, reports: { view: "organisation" }, audit: { view: "organisation" } },
  },
];

/** Labels for roles that aren't templates. */
const OTHER_INFO: Record<string, { icon: LucideIcon; info: string }> = {
  admin: { icon: ShieldCheck, info: "Full access to everything, including settings and billing." },
  web_developer: { icon: Code2, info: "Builds and looks after the website; own tasks and tickets." },
};

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
export const roleTemplate = (name: string) => ROLE_TEMPLATES.find(t => t.key === name || slug(t.label) === name);

/** Icon and one-line use case for any role name; custom roles fall back to a generic line. */
export function roleInfo(name: string): { icon: LucideIcon; info: string } {
  const t = roleTemplate(name);
  return t ? { icon: t.icon, info: t.info } : OTHER_INFO[name] ?? { icon: Users, info: "Custom role. Edit it to see what it can use." };
}

/** "Field Visits (own) · Field contacts (team)": the modules a role can open, from its grants. */
export function grantSummary(grants: Grants | null | undefined): { label: string; scope: string }[] {
  if (!grants) return [];
  return PERMISSION_MODULES.flatMap(m => {
    const view = grants[m.key]?.view as Scope | undefined;
    return view ? [{ label: m.label, scope: SCOPE_LABELS[view] }] : [];
  });
}
