"use client";
import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MktList, MktTask, Profile } from "@/types";

type SortKey = "title" | "status" | "priority" | "due_date" | "assignee";

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

type Props = {
  list: MktList;
  tasks: MktTask[];
  members: Profile[];
  onOpenTask: (id: string) => void;
};

export default function MarketingTable({ list, tasks, members, onOpenTask }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "due_date", dir: 1 });

  const nameOf = (id?: string) => members.find((m) => m.id === id)?.name || members.find((m) => m.id === id)?.email || "—";
  const colOf = (id: string) => list.statuses.find((s) => s.id === id);
  const fields = list.custom_fields ?? [];
  const fmtField = (f: (typeof fields)[number], v: any) => {
    if (v == null || v === "") return "—";
    if (f.type === "checkbox") return v ? "✓" : "—";
    if (f.type === "user") return nameOf(v);
    if (f.type === "money") return `₹${Number(v).toLocaleString("en-IN")}`;
    if (f.type === "date") return new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return String(v);
  };

  const rows = useMemo(() => {
    const val = (t: MktTask): string | number => {
      switch (sort.key) {
        case "title": return t.title.toLowerCase();
        case "status": return colOf(t.status)?.name.toLowerCase() ?? t.status;
        case "priority": return PRIORITY_ORDER[t.priority] ?? 9;
        case "due_date": return t.due_date ?? "9999-12-31";
        case "assignee": return nameOf(t.assignees?.[0]).toLowerCase();
      }
    };
    return [...tasks].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av < bv) return -1 * sort.dir;
      if (av > bv) return 1 * sort.dir;
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, sort, members, list.statuses]);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));

  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th className={cn("px-4 py-2.5", right && "text-right")}>
      <button
        onClick={() => toggle(k)}
        className={cn("inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[#5f5f5d] hover:text-[#1c1c1c]", right && "flex-row-reverse")}
      >
        {label}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  return (
    <div className="bg-white border border-[#eceae4] rounded-2xl overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead className="border-b border-[#eceae4]">
          <tr>
            <Th k="title" label="Task" />
            <Th k="status" label="Status" />
            <Th k="priority" label="Priority" />
            <Th k="assignee" label="Assignee" />
            <Th k="due_date" label="Due" right />
            {fields.map((f) => (
              <th key={f.id} className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-[#5f5f5d] whitespace-nowrap">{f.name}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eceae4]">
          {rows.length === 0 && (
            <tr>
              <td colSpan={5 + fields.length} className="px-4 py-8 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d]/50">
                No tasks
              </td>
            </tr>
          )}
          {rows.map((t) => {
            const col = colOf(t.status);
            return (
              <tr key={t.id} onClick={() => onOpenTask(t.id)} className="cursor-pointer hover:bg-[#f7f4ed]">
                <td className="px-4 py-3 text-[13px] font-semibold text-[#1c1c1c]">{t.title}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#5f5f5d]">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col?.color ?? "#ccc" }} />
                    {col?.name ?? t.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[10px] font-bold text-[#5f5f5d] capitalize">{t.priority}</td>
                <td className="px-4 py-3 text-[11px] font-medium text-[#5f5f5d]">{nameOf(t.assignees?.[0])}</td>
                <td className="px-4 py-3 text-right text-[11px] font-bold text-[#5f5f5d]">
                  {t.due_date ? new Date(t.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                </td>
                {fields.map((f) => (
                  <td key={f.id} className="px-4 py-3 text-[11px] font-medium text-[#5f5f5d] whitespace-nowrap">
                    {fmtField(f, (t.custom_fields ?? {})[f.id])}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
