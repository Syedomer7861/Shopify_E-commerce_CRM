"use client";
import { useEffect, useState } from "react";
import { Loader2, Plus, ArrowRightLeft, Pencil, Trash2, MessageSquare, Clock } from "lucide-react";
import { Modal } from "@/components/ui";
import { marketingApi, type MktActivityEntry } from "@/lib/marketing-client";
import type { Profile } from "@/types";

const rel = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

function iconFor(action: string) {
  if (action.includes("created")) return <Plus className="w-3 h-3" />;
  if (action.includes("status")) return <ArrowRightLeft className="w-3 h-3" />;
  if (action.includes("deleted")) return <Trash2 className="w-3 h-3" />;
  if (action.includes("comment")) return <MessageSquare className="w-3 h-3" />;
  return <Pencil className="w-3 h-3" />;
}

type Props = {
  taskId: string;
  taskTitle?: string;
  members?: Profile[];
  onClose: () => void;
};

// Full audit trail for one task — who did what, when. Data comes from
// audit_logs (entity_type='mkt_task'); the PATCH/POST/DELETE routes write it.
export default function TaskHistoryModal({ taskId, taskTitle, members = [], onClose }: Props) {
  const [rows, setRows] = useState<MktActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    marketingApi
      .listActivity(taskId)
      .then((r) => live && setRows(r))
      .catch(() => live && setRows([]))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [taskId]);

  const who = (r: MktActivityEntry) => {
    if (r.actor_name) return r.actor_name;
    const m = members.find((x) => x.email && x.email === r.actor_email);
    return m?.name || r.actor_email || "Someone";
  };

  const line = (r: MktActivityEntry) => {
    const md = r.metadata || {};
    if (r.action.includes("status") && (md.from_status_name || md.to_status_name)) {
      return (
        <>
          moved this from{" "}
          <span className="font-bold text-[#1c1c1c]">{md.from_status_name || md.from_status}</span>{" "}
          to <span className="font-bold text-[#1c1c1c]">{md.to_status_name || md.to_status}</span>
        </>
      );
    }
    if (r.action.includes("created")) return "created this task";
    if (r.action.includes("deleted")) return "deleted this task";
    return r.summary?.replace(/^Updated /, "updated ") || "updated this task";
  };

  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2"><Clock className="w-4 h-4" /> History</span>} maxWidth="max-w-md">
      {taskTitle && <div className="text-[13px] font-bold text-[#1c1c1c] mb-3 truncate">{taskTitle}</div>}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#5f5f5d]" /></div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d]/40">
          No history yet
        </div>
      ) : (
        <div className="space-y-0 max-h-[60vh] overflow-y-auto">
          {rows.map((r, i) => (
            <div key={r.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-[#f2efe8] text-[#5f5f5d] flex items-center justify-center flex-shrink-0">
                  {iconFor(r.action)}
                </div>
                {i < rows.length - 1 && <div className="w-px flex-1 bg-[#eceae4] my-1" />}
              </div>
              <div className="pb-4 min-w-0">
                <div className="text-[12px] text-[#5f5f5d] leading-snug">
                  <span className="font-bold text-[#1c1c1c]">{who(r)}</span> {line(r)}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d]/50 mt-0.5">
                  {rel(r.created_at)} ·{" "}
                  {new Date(r.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
