"use client";
import Link from "next/link";
import { ArrowUpRight, Building2, Network, Users } from "lucide-react";
import { groupCounts, type OrgOverview, type Unit } from "@/lib/org-overview";

/**
 * The organisation's own hierarchy as a chart: the organisation on top, its
 * top-level departments below, and their sub-departments under each. Built
 * from departments.parent_id as configured; nothing assumes an industry shape.
 */
export function StructureCard({ data }: { data: OrgOverview }) {
  const byDept = groupCounts(data.summary, "department");
  const byBranch = groupCounts(data.summary, "branch");
  const active = data.departments.filter(d => d.is_active);
  const ids = new Set(active.map(d => d.id));
  const children = (pid: string | null) => active.filter(d => (d.parent_id && ids.has(d.parent_id) ? d.parent_id : null) === pid);
  // Head count of a department including everything below it.
  const total = (d: Unit): number => (byDept.get(d.id) ?? 0) + children(d.id).reduce((s, k) => s + total(k), 0);
  const top = children(null);
  const unplaced = byDept.get(null) ?? 0;
  const branches = data.branches.filter(b => b.is_active);

  const box = (d: Unit, small = false) => (
    <div className={`rounded-xl border border-[#eceae4] bg-white text-center ${small ? "px-2 py-1.5" : "px-3 py-2"} shadow-sm transition-transform hover:-translate-y-0.5`} title={d.head_id ? `Head: ${data.names[d.head_id] ?? "—"}` : "No head set"}>
      <div className={`font-semibold text-[#1c1c1c] truncate ${small ? "text-[10px]" : "text-[11px]"}`}>{d.name}</div>
      <div className="inline-flex items-center gap-1 text-[10px] text-[#5f5f5d]"><Users className="w-3 h-3" />{total(d)}</div>
    </div>
  );

  return (
    <div className="card p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[#1c1c1c] flex items-center gap-2"><Network className="w-4 h-4" /> Organisation structure</h3>
        <Link href="/organisation" className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] hover:text-[#1c1c1c]">Full structure <ArrowUpRight className="w-3 h-3" /></Link>
      </div>
      {active.length === 0 ? (
        <p className="text-xs text-[#5f5f5d]">No departments yet. <Link href="/organisation" className="underline font-semibold">Add your first department</Link> or <Link href="/organisation?templates=1" className="underline font-semibold">start from an industry template</Link>.</p>
      ) : (
        <div className="overflow-x-auto pb-1">
          <div className="min-w-max flex flex-col items-center">
            <div className="rounded-xl bg-[#1c1c1c] text-white px-4 py-2 text-[11px] font-bold inline-flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />{data.org?.name ?? "Organisation"}</div>
            <div className="w-px h-4 bg-[#d6d3cc]" />
            <div className="flex gap-3 relative">
              {top.map((d, i) => (
                <div key={d.id} className="flex flex-col items-center relative w-32">
                  {/* connector: horizontal rail spanning siblings + drop to the box */}
                  {top.length > 1 && <div className="absolute top-0 h-px bg-[#d6d3cc]" style={{ left: i === 0 ? "50%" : "-6px", right: i === top.length - 1 ? "50%" : "-6px" }} />}
                  <div className="w-px h-3 bg-[#d6d3cc]" />
                  <div className="w-full">{box(d)}</div>
                  {children(d.id).length > 0 && (
                    <div className="w-full flex flex-col items-center">
                      <div className="w-px h-3 bg-[#d6d3cc]" />
                      <div className="w-[88%] space-y-1.5">
                        {children(d.id).slice(0, 4).map(k => <div key={k.id}>{box(k, true)}</div>)}
                        {children(d.id).length > 4 && <div className="text-center text-[10px] text-[#5f5f5d]">+{children(d.id).length - 4} more</div>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {(unplaced > 0 || branches.length > 0) && (
        <div className="mt-auto pt-3 border-t border-[#eceae4] space-y-2">
          {unplaced > 0 && <div className="text-[11px] text-amber-700">{unplaced} active employee(s) without a department</div>}
          {branches.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {branches.map(b => (
                <span key={b.id} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border border-[#eceae4]">
                  <Building2 className="w-3 h-3" />{b.name}{b.is_head_office ? " (HQ)" : ""}{b.city ? ` · ${b.city}` : ""} · {byBranch.get(b.id) ?? 0}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
