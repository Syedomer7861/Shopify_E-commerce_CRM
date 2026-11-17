"use client";
import { useState } from "react";
import { PieChart as PieIcon } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { cn } from "@/lib/utils";
import { PANEL } from "@/components/dashboard/Tiles";
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
// Same series colours the app's other charts use (CourierPerformance), then ink.
const COLORS = ["#55c08f", "#a9c92a", "#f0b43c", "#6b6b67", "#8fb3e8", "#ef8a7c", "#1c1c1c"];
const UNSET = "#d6d3cc";
const MAX_SLICES = 6;

/** Active employees split by one dimension, as a donut. Values come from org_workforce_summary(). */
export function WorkforceCard({ data }: { data: OrgOverview }) {
  const [dim, setDim] = useState<(typeof DIMS)[number]["key"]>("department");
  const counts = groupCounts(data.summary, dim);
  const named = (list: { id: string; name: string }[]) => new Map(list.map(u => [u.id, u.name]));
  const names = dim === "department" ? named(data.departments) : dim === "branch" ? named(data.branches) : dim === "designation" ? named(data.designations) : null;
  const sorted = Array.from(counts.entries())
    .map(([k, n]) => ({ label: k == null ? "Not set" : names ? names.get(k) ?? "Removed" : k.replace(/_/g, " "), n, unset: k == null }))
    .sort((a, b) => Number(a.unset) - Number(b.unset) || b.n - a.n);
  const set = sorted.filter(r => !r.unset);
  const rest = set.slice(MAX_SLICES);
  const rows = [
    ...set.slice(0, MAX_SLICES).map((r, i) => ({ ...r, color: COLORS[i] })),
    ...(rest.length ? [{ label: `Others (${rest.length})`, n: rest.reduce((s, r) => s + r.n, 0), unset: false, color: COLORS[MAX_SLICES] }] : []),
    ...sorted.filter(r => r.unset).map(r => ({ ...r, color: UNSET })),
  ];
  const total = rows.reduce((s, r) => s + r.n, 0);
  const allUnset = rows.length === 1 && rows[0].unset;

  return (
    <div className={cn(PANEL, "h-full")}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-[#1c1c1c] flex items-center gap-2"><PieIcon className="w-4 h-4" /> Employee distribution</h3>
        <select aria-label="Group by" className="h-8 px-2 bg-white border border-[#ebece6] rounded-lg text-xs" value={dim} onChange={e => setDim(e.target.value as typeof dim)}>
          {DIMS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      </div>
      {!data.summary ? <p className="text-xs text-[#5f5f5d]">Workforce data isn&apos;t available.</p>
      : total === 0 ? <p className="text-xs text-[#5f5f5d]">No active employees.</p>
      : allUnset ? <p className="text-xs text-[#5f5f5d]">Nobody has a {DIMS.find(d => d.key === dim)?.label.toLowerCase()} set yet. Fill it in on each employee&apos;s profile.</p>
      : (
        <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-4 min-w-0">
          <div className="relative w-36 h-36 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rows} dataKey="n" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={rows.length > 1 ? 2 : 0} stroke="none" animationDuration={700}>
                  {rows.map(r => <Cell key={r.label} fill={r.color} />)}
                </Pie>
                <Tooltip formatter={(v: number, n: string) => [`${v} (${Math.round((v / total) * 100)}%)`, n]} contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #ebece6" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-[#1c1c1c] leading-none">{total}</span>
              <span className="text-[10px] text-[#5f5f5d]">active</span>
            </div>
          </div>
          <ul className="flex-1 min-w-0 w-full space-y-1.5 text-xs">
            {rows.map(r => (
              <li key={r.label} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.color }} />
                <span title={r.label} className={cn("truncate capitalize flex-1 min-w-0", r.unset ? "text-amber-700" : "text-[#1c1c1c]")}>{r.label}</span>
                <span className="font-bold text-[#1c1c1c] tabular-nums">{r.n}</span>
                <span className="text-[10px] text-[#5f5f5d] w-9 text-right">{Math.round((r.n / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
