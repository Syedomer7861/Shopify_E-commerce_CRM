"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";
import type { OrgOverview } from "@/lib/org-overview";
import { PANEL } from "@/components/dashboard/Tiles";

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
  const done = known.filter(s => s.done).length;
  const pct = known.length ? Math.round((done / known.length) * 100) : 0;
  // Bar grows from 0 on first paint.
  const [shown, setShown] = useState(0);
  useEffect(() => { const t = requestAnimationFrame(() => setShown(pct)); return () => cancelAnimationFrame(t); }, [pct]);
  return (
    <div className={`${PANEL} h-full`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-[#1c1c1c] flex items-center gap-2"><ListChecks className="w-4 h-4" /> Setup progress</h3>
          <p className="text-[11px] text-[#5f5f5d] mt-0.5">{done} of {known.length} steps done{known.length < steps.length ? `; ${steps.length - known.length} need access you don't have` : ""}.</p>
        </div>
        <span className="text-lg font-bold text-[#2f8a5f] bg-[#ecf8f1] px-2.5 py-1 rounded-lg">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-[#ebece6] overflow-hidden mb-5">
        <div className="h-full bg-[#3fa877] rounded-full transition-[width] duration-1000 ease-out" style={{ width: `${shown}%` }} />
      </div>
      <ul className="grid grid-cols-3 sm:grid-cols-5 gap-y-4 gap-x-2">
        {steps.map(s => (
          <li key={s.label}>
            <Link href={s.href} className="flex flex-col items-center text-center gap-1 group" title={s.detail}>
              {s.done ? <CheckCircle2 className="w-6 h-6 text-[#3fa877] transition-transform group-hover:scale-110" />
                : <Circle className={`w-6 h-6 transition-transform group-hover:scale-110 ${s.done === null ? "text-[#d6d3cc]" : "text-[#5f5f5d]/50"}`} />}
              <span className="text-[11px] font-semibold text-[#1c1c1c] leading-tight">{s.label}</span>
              <span className="text-[10px] text-[#5f5f5d] leading-tight">{s.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
