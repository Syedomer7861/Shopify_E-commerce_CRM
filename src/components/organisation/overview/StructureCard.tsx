"use client";
import Link from "next/link";
import { Building2, ChevronRight, Network, Users } from "lucide-react";
import { groupCounts, type OrgOverview, type Unit } from "@/lib/org-overview";

/**
 * The organisation's own hierarchy, as configured: departments nested by
 * parent_id (any depth, any naming), with heads and active headcount, plus
 * branches. Nothing is assumed about the industry's shape.
 */
export function StructureCard({ data }: { data: OrgOverview }) {
  const byDept = groupCounts(data.summary, "department");
  const byBranch = groupCounts(data.summary, "branch");
  const active = data.departments.filter(d => d.is_active);
  const ids = new Set(active.map(d => d.id));
  const children = (pid: string | null) => active.filter(d => (d.parent_id && ids.has(d.parent_id) ? d.parent_id : null) === pid);
  const unplaced = byDept.get(null) ?? 0;

  const node = (d: Unit, depth: number): React.ReactNode => {
    const kids = children(d.id);
    const row = (
      <span className="flex items-center gap-2 py-1.5 text-xs">
        {kids.length > 0 ? <ChevronRight className="w-3 h-3 text-[#5f5f5d] transition-transform group-open:rotate-90" /> : <span className="w-3" />}
        <span className="font-semibold text-[#1c1c1c] truncate">{d.name}</span>
        {d.head_id && <span className="text-[10px] text-[#5f5f5d] truncate">· head {data.names[d.head_id] ?? "—"}</span>}
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-[#5f5f5d]"><Users className="w-3 h-3" />{byDept.get(d.id) ?? 0}</span>
      </span>
    );
    return kids.length === 0 ? <div key={d.id} style={{ paddingLeft: depth * 14 }}>{row}</div> : (
      <details key={d.id} open={depth === 0} className="group" style={{ paddingLeft: depth * 14 }}>
        <summary className="list-none cursor-pointer">{row}</summary>
        {kids.map(k => node(k, depth + 1))}
      </details>
    );
  };

  return (
    <div className="card p-5 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#1c1c1c] flex items-center gap-2"><Network className="w-4 h-4" /> Organisation structure</h3>
        <Link href="/organisation" className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] hover:text-[#1c1c1c]">Manage</Link>
      </div>
      {active.length === 0 ? (
        <p className="text-xs text-[#5f5f5d]">No departments yet. <Link href="/organisation" className="underline font-semibold">Add your first department</Link> or apply an industry template.</p>
      ) : (
        <div className="max-h-72 overflow-y-auto pr-1">
          {children(null).map(d => node(d, 0))}
          {unplaced > 0 && <div className="py-1.5 text-xs text-amber-700">{unplaced} active employee(s) without a department</div>}
        </div>
      )}
      {data.branches.filter(b => b.is_active).length > 0 && (
        <div className="mt-3 pt-3 border-t border-[#eceae4]">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] mb-1.5">Branches</div>
          <div className="flex flex-wrap gap-1.5">
            {data.branches.filter(b => b.is_active).map(b => (
              <span key={b.id} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border border-[#eceae4]">
                <Building2 className="w-3 h-3" />{b.name}{b.is_head_office ? " (HQ)" : ""}{b.city ? ` · ${b.city}` : ""} · {byBranch.get(b.id) ?? 0}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
