"use client";
import { useState } from "react";
import { PieChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { groupCounts, type OrgOverview } from "@/lib/org-overview";

const DIMS = [
  { key: "department", label: "Department" },
  { key: "branch", label: "Branch" },
  { key: "designation", label: "Designation" },
  { key: "role", label: "System role" },
  { key: "employment_type", label: "Employment type" },
  { key: "work_arrangement", label: "Work arrangement" },
  { key: "employment_status", label: "Status" },
] as const;

/** Active employees split by one dimension. Values come from org_workforce_summary(). */
export function WorkforceCard({ data }: { data: OrgOverview }) {
  const [dim, setDim] = useState<(typeof DIMS)[number]["key"]>("department");
  const counts = groupCounts(data.summary, dim);
  const named = (list: { id: string; name: string }[]) => new Map(list.map(u => [u.id, u.name]));
  const names = dim === "department" ? named(data.departments) : dim === "branch" ? named(data.branches) : dim === "designation" ? named(data.designations) : null;
  const rows = Array.from(counts.entries())
    .map(([k, n]) => ({ label: k == null ? "Not set" : names ? names.get(k) ?? "Removed" : k.replace(/_/g, " "), n, unset: k == null }))
    .sort((a, b) => b.n - a.n);
  const total = rows.reduce((s, r) => s + r.n, 0);
  const allUnset = rows.length === 1 && rows[0].unset;

  return (
    <div className="card p-5 h-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-[#1c1c1c] flex items-center gap-2"><PieChart className="w-4 h-4" /> Workforce distribution</h3>
        <select aria-label="Group by" className="h-8 px-2 bg-white border border-[#eceae4] rounded-lg text-xs" value={dim} onChange={e => setDim(e.target.value as typeof dim)}>
          {DIMS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      </div>
      {!data.summary ? <p className="text-xs text-[#5f5f5d]">Workforce data isn&apos;t available.</p>
      : total === 0 ? <p className="text-xs text-[#5f5f5d]">No active employees.</p>
      : allUnset ? <p className="text-xs text-[#5f5f5d]">Nobody has a {DIMS.find(d => d.key === dim)?.label.toLowerCase()} set yet. Fill it in on each employee&apos;s profile.</p>
      : (
        <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {rows.map(r => (
            <li key={r.label} className="text-xs">
              <div className="flex justify-between mb-0.5">
                <span className={cn("font-semibold capitalize truncate", r.unset ? "text-amber-700" : "text-[#1c1c1c]")}>{r.label}</span>
                <span className="text-[#5f5f5d]">{r.n} ({Math.round((r.n / total) * 100)}%)</span>
              </div>
              <div className="h-1.5 rounded-full bg-[#eceae4] overflow-hidden">
                <div className={cn("h-full rounded-full", r.unset ? "bg-amber-400" : "bg-[#1c1c1c]")} style={{ width: `${(r.n / total) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
