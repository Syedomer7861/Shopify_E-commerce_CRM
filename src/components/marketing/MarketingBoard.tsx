"use client";
import { useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Plus, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MktList, MktTask } from "@/types";
import { midPosition } from "@/lib/marketing-client";

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-rose-500",
  high: "bg-amber-500",
  normal: "bg-slate-300",
  low: "bg-slate-200",
};

export type BoardColumn = { id: string; name: string; color: string };

type Props = {
  list: MktList;
  tasks: MktTask[];
  columns: BoardColumn[];
  groupOf: (t: MktTask) => string;
  showWip?: boolean; // only meaningful when grouping by status
  onOpenTask: (id: string) => void;
  onMove: (taskId: string, columnId: string, position: number) => void;
  onQuickAdd: (columnId: string, title: string) => void;
  onHistory?: (id: string) => void;
};

export default function MarketingBoard({ list, tasks, columns, groupOf, showWip, onOpenTask, onMove, onQuickAdd, onHistory }: Props) {
  const [adding, setAdding] = useState<string | null>(null);

  const byColumn = useMemo(() => {
    const map: Record<string, MktTask[]> = {};
    for (const c of columns) map[c.id] = [];
    for (const t of tasks) (map[groupOf(t)] ??= []).push(t);
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.position - b.position);
    return map;
  }, [columns, tasks, groupOf]);

  function handleDragEnd(result: DropResult) {
    const { destination, draggableId, source } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const targetCol = (byColumn[destination.droppableId] ?? []).filter((t) => t.id !== draggableId);
    const before = targetCol[destination.index - 1]?.position;
    const after = targetCol[destination.index]?.position;
    onMove(draggableId, destination.droppableId, midPosition(before, after));
  }

  function commitAdd(columnId: string, value: string) {
    setAdding(null);
    const title = value.trim();
    if (title) onQuickAdd(columnId, title);
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 items-start">
        {columns.map((col) => {
          const items = byColumn[col.id] ?? [];
          const overLimit = showWip && list.wip_limit != null && items.length > list.wip_limit;
          return (
            <div key={col.id} className="w-72 flex-shrink-0 bg-[#f2efe8] rounded-2xl border border-[#eceae4] flex flex-col">
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                  <span className="text-[11px] font-black uppercase tracking-widest text-[#1c1c1c]">{col.name}</span>
                  <span className={cn("text-[10px] font-bold px-1.5 rounded-full", overLimit ? "bg-rose-100 text-rose-600" : "bg-[#eceae4] text-[#5f5f5d]")}>
                    {items.length}
                    {showWip && list.wip_limit != null ? `/${list.wip_limit}` : ""}
                  </span>
                </div>
                <button
                  onClick={() => setAdding(col.id)}
                  className="w-6 h-6 rounded-lg hover:bg-[#eceae4] flex items-center justify-center text-[#5f5f5d]"
                  aria-label={`Add task to ${col.name}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "px-2 pb-2 space-y-2 min-h-[60px] transition-colors rounded-b-2xl",
                      snapshot.isDraggingOver && "bg-[#e8e4da]"
                    )}
                  >
                    {adding === col.id && (
                      <div className="bg-white rounded-xl border border-[#1c1c1c] p-2">
                        <textarea
                          autoFocus
                          defaultValue=""
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); }
                            if (e.key === "Escape") { e.currentTarget.value = ""; e.currentTarget.blur(); }
                          }}
                          onBlur={(e) => commitAdd(col.id, e.currentTarget.value)}
                          placeholder="Task title — Enter to save, Esc to cancel"
                          className="w-full text-[13px] font-medium resize-none outline-none placeholder:text-[#5f5f5d]/40"
                          rows={2}
                        />
                      </div>
                    )}

                    {items.map((t, i) => (
                      <Draggable key={t.id} draggableId={t.id} index={i}>
                        {(dp, ds) => (
                          <div
                            ref={dp.innerRef}
                            {...dp.draggableProps}
                            {...dp.dragHandleProps}
                            onClick={() => onOpenTask(t.id)}
                            className={cn(
                              "group/card bg-white rounded-xl border border-[#eceae4] p-3 cursor-pointer hover:border-[#1c1c1c]/30 transition-all",
                              ds.isDragging && "shadow-lg rotate-1"
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <span className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", PRIORITY_DOT[t.priority] ?? PRIORITY_DOT.normal)} />
                              <p className="text-[13px] font-semibold text-[#1c1c1c] leading-snug flex-1">{t.title}</p>
                              {onHistory && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onHistory(t.id); }}
                                  title="History"
                                  className="opacity-0 group-hover/card:opacity-100 transition-opacity text-[#5f5f5d]/50 hover:text-[#1c1c1c] flex-shrink-0 -mt-0.5"
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            {(t.tags?.length > 0 || t.due_date || t.assignees?.length > 0) && (
                              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                {t.tags?.slice(0, 3).map((tag) => (
                                  <span key={tag} className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#f2efe8] text-[#5f5f5d]">
                                    {tag}
                                  </span>
                                ))}
                                {t.due_date && (
                                  <span className="text-[9px] font-bold text-[#5f5f5d] ml-auto">
                                    {new Date(t.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                  </span>
                                )}
                                {t.assignees?.slice(0, 3).map((a) => (
                                  <span key={a} className="w-4 h-4 rounded-full bg-[#1c1c1c] text-white text-[7px] font-black flex items-center justify-center">
                                    {a.slice(0, 2).toUpperCase()}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
