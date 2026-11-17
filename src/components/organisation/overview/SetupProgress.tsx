"use client";
import Link from "next/link";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";
import type { OrgOverview } from "@/lib/org-overview";

type Step = { label: string; done: boolean | null; detail: string; href: string };

/** Setup checklist computed from real records. null = couldn't be checked (no access). */
export function setupSteps(d: OrgOverview): Step[] {
  const s = d.summary;
  const act = (l: { is_active: boolean }[]) => l.filter(x => x.is_active).length;
  const nonAdmins = s ? s.active - (s.groups.find(g => g.dim === "role" && g.key === "admin")?.n ?? 0) : 0;
  return [
    { label: "Branches", done: act(d.branches) > 0, detail: `${act(d.branches)} active`, href: "/organisation" },
    { label: "Departments", done: act(d.departments) > 0, detail: `${act(d.departments)} active`, href: "/organisation" },
    { label: "Designations", done: act(d.designations) > 0, detail: `${act(d.designations)} active`, href: "/organisation" },
    { label: "Employees", done: s ? s.active > 1 : null, detail: s ? `${s.active} active` : "—", href: "/team" },
    { label: "Everyone placed", done: s ? s.active > 0 && s.with_department === s.active : null, detail: s ? `${s.with_department}/${s.active} have a department` : "—", href: "/organisation" },
    { label: "Reporting lines", done: s ? nonAdmins > 0 && s.with_manager >= nonAdmins : null, detail: s ? `${s.with_manager}/${Math.max(nonAdmins, 0)} have a manager` : "—", href: "/organisation" },
    { label: "Custom roles", done: d.counts.customRoles == null ? null : d.counts.customRoles > 0, detail: d.counts.customRoles == null ? "—" : `${d.counts.customRoles} roles`, href: "/roles" },
    { label: "Holidays", done: d.counts.holidays == null ? null : d.counts.holidays > 0, detail: d.counts.holidays == null ? "—" : `${d.counts.holidays} listed`, href: "/hr?tab=attendance-reg" },
    { label: "Policies", done: d.counts.policies == null ? null : d.counts.policies > 0, detail: d.counts.policies == null ? "—" : `${d.counts.policies} uploaded`, href: "/hr?tab=documents" },
    { label: "KPI plans", done: d.counts.kpiPlans == null ? null : d.counts.kpiPlans > 0, detail: d.counts.kpiPlans == null ? "—" : `${d.counts.kpiPlans} active`, href: "/kpi" },
  ];
}

export function SetupProgress({ data }: { data: OrgOverview }) {
  const steps = setupSteps(data);
  const known = steps.filter(s => s.done !== null);
  const pct = known.length ? Math.round((known.filter(s => s.done).length / known.length) * 100) : 0;
  return (
    <div className="card p-5 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#1c1c1c] flex items-center gap-2"><ListChecks className="w-4 h-4" /> Setup progress</h3>
        <span className="text-sm font-black text-[#1c1c1c]">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-[#eceae4] overflow-hidden mb-4">
        <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        {steps.map(s => (
          <li key={s.label}>
            <Link href={s.href} className="flex items-start gap-2 text-xs hover:opacity-80">
              {s.done ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" /> : <Circle className="w-4 h-4 text-[#5f5f5d]/50 flex-shrink-0" />}
              <span><span className="font-semibold text-[#1c1c1c]">{s.label}</span><br /><span className="text-[10px] text-[#5f5f5d]">{s.detail}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
