"use client";
import { useState, type ReactNode } from "react";
import { Pencil, Plus } from "lucide-react";
import { Select } from "@/components/ui";
import type { RecordRow, RecordsConfig } from "@/components/records/RecordsModule";

const label = (s: string) => s.replace(/_/g, " ");

/**
 * Kanban view of a records table: one neutral column per status. Drag a card
 * to another column (or use its status picker on touch screens) to move it;
 * "+" on a column opens the new-record form with that status.
 */
export function RecordsBoard({
  config, rows, columns, people, canEditRow, canCreate, onMove, onAdd, onEdit, reload,
}: {
  config: RecordsConfig;
  rows: RecordRow[];
  columns: { key: string; label: string; format?: (value: any, row: RecordRow) => ReactNode }[];
  people: Record<string, string>;
  canEditRow: (row: RecordRow) => boolean;
  canCreate: boolean;
  onMove: (row: RecordRow, status: string) => void;
  onAdd: (status: string) => void;
  onEdit: (row: RecordRow) => void;
  reload: () => void;
}) {
  const statuses = config.statuses || [];
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [title, ...meta] = columns;
  const valueKey = columns.find(c => /value|amount|total/.test(c.key));

  function drop(status: string) {
    const row = rows.find(r => r.id === dragId);
    setDragId(null); setOver(null);
    if (row && row.status !== status && canEditRow(row)) onMove(row, status);
  }

  const show = (c: (typeof columns)[number], row: RecordRow) => c.format ? c.format(row[c.key], row) : (row[c.key] ?? "—");

  return (
    <div className="flex gap-3 overflow-x-auto pb-3 snap-x">
      {statuses.map(s => {
        const items = rows.filter(r => r.status === s);
        const sum = valueKey ? items.reduce((t, r) => t + (Number(r[valueKey.key]) || 0), 0) : 0;
        return (
          <section key={s} aria-label={label(s)}
            onDragOver={e => { if (dragId) { e.preventDefault(); setOver(s); } }}
            onDragLeave={() => setOver(o => (o === s ? null : o))}
            onDrop={e => { e.preventDefault(); drop(s); }}
            className={"snap-start shrink-0 w-[272px] rounded-xl border bg-[#f6f7f2] flex flex-col max-h-[70vh] transition-colors " + (over === s ? "border-[#1c1c1c]" : "border-[#ebece6]")}>
            <header className="flex items-center gap-2 px-3 py-2.5 border-b border-[#ebece6]">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#1c1c1c]">{label(s)}</h3>
              <span className="px-1.5 rounded-full bg-white border border-[#ebece6] text-[10px] font-bold text-[#6b6b67] tabular-nums">{items.length}</span>
              {valueKey && sum > 0 && <span className="text-[10px] text-[#9a9a94] tabular-nums">₹{sum.toLocaleString("en-IN")}</span>}
              {canCreate && (
                <button onClick={() => onAdd(s)} aria-label={`Add ${config.noun} as ${label(s)}`} title={`Add ${config.noun}`}
                  className="ml-auto p-1 rounded-md text-[#6b6b67] hover:bg-white hover:text-[#1c1c1c]"><Plus className="w-3.5 h-3.5" /></button>
              )}
            </header>
            <div className="p-2 space-y-2 overflow-y-auto flex-1 min-h-[80px]">
              {items.length === 0 && <p className="py-6 text-center text-[10px] text-[#9a9a94]">{dragId ? "Drop here" : "Nothing here"}</p>}
              {items.map(row => {
                const editable = canEditRow(row);
                return (
                  <article key={row.id} draggable={editable}
                    onDragStart={e => { setDragId(row.id); e.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => { setDragId(null); setOver(null); }}
                    className={"group rounded-lg border border-[#ebece6] bg-white p-2.5 text-xs " + (editable ? "cursor-grab active:cursor-grabbing" : "") + (dragId === row.id ? " opacity-40" : "")}>
                    <div className="flex items-start gap-2">
                      <div className="font-semibold text-[#1c1c1c] min-w-0 flex-1 break-words">{title ? show(title, row) : row.id}</div>
                      {config.editable && editable && (
                        <button onClick={() => onEdit(row)} aria-label={`Edit ${config.noun}`} className="text-[#c4c5bd] hover:text-[#1c1c1c]"><Pencil className="w-3 h-3" /></button>
                      )}
                    </div>
                    <dl className="mt-1.5 space-y-0.5">
                      {meta.filter(c => row[c.key] !== null && row[c.key] !== undefined && row[c.key] !== "").slice(0, 3).map(c => (
                        <div key={c.key} className="flex gap-1.5 text-[11px]"><dt className="text-[#9a9a94] shrink-0">{c.label}</dt><dd className="text-[#3a3a36] truncate">{show(c, row)}</dd></div>
                      ))}
                    </dl>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] text-[#9a9a94] truncate flex-1">{people[row[config.ownerCol]] || "Unassigned"}</span>
                      {editable && (
                        <div className="w-[108px]"><Select value={row.status} onChange={v => onMove(row, v)} triggerClassName="text-[10px] h-6 capitalize"
                          options={statuses.map(x => ({ value: x, label: label(x) }))} /></div>
                      )}
                    </div>
                    {config.rowActions && <div className="mt-2 empty:hidden">{config.rowActions(row, reload)}</div>}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
