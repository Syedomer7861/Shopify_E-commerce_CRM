"use client";
import { useEffect, useState } from "react";
import { ClipboardPlus, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Modal, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { marketingApi } from "@/lib/marketing-client";
import type { MktSpace, MktList } from "@/types";

type TeamMember = { id: string; name: string; email: string; designation?: string | null };

/**
 * Lets a manager/admin assign a task to any teammate without leaving their
 * dashboard - picks a teammate, a Workspace Space + List to put the task in,
 * and the usual fields. Creates a real mkt_tasks row via the same API the
 * Workspace board uses, so the assignee sees it immediately in My Hub's
 * "Assigned Tasks" tab / their dashboard's "Assigned to Me" card.
 */
export function AssignTaskWidget() {
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [spaces, setSpaces] = useState<MktSpace[]>([]);
  const [lists, setLists] = useState<MktList[]>([]);
  const [saving, setSaving] = useState(false);

  const [assigneeId, setAssigneeId] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [listId, setListId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"urgent" | "high" | "normal" | "low">("normal");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    supabase.from("profiles").select("id, name, email, designation").eq("is_active", true).order("name")
      .then(({ data }) => setTeam((data || []) as TeamMember[]));
    marketingApi.listSpaces().then(setSpaces).catch(() => setSpaces([]));
  }, [open]);

  useEffect(() => {
    if (!spaceId) { setLists([]); setListId(""); return; }
    marketingApi.listLists(spaceId).then(data => {
      setLists(data);
      setListId(data[0]?.id || "");
    }).catch(() => setLists([]));
  }, [spaceId]);

  function reset() {
    setAssigneeId(""); setSpaceId(""); setListId(""); setTitle("");
    setDescription(""); setPriority("normal"); setDueDate("");
  }

  async function handleAssign() {
    if (!assigneeId) return toast.error("Pick who this is for");
    if (!listId) return toast.error("Pick a Space and board for this task");
    if (!title.trim()) return toast.error("Give the task a title");

    setSaving(true);
    try {
      await marketingApi.createTask({
        list_id: listId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        due_date: dueDate || null,
        assignees: [assigneeId],
      });
      toast.success("Task assigned");
      setOpen(false);
      reset();
    } catch (e: any) {
      toast.error(e.message || "Failed to assign task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group relative px-6 py-3 rounded-2xl bg-white border border-[#eceae4] overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98] hover:border-[#1c1c1c]/20 flex items-center gap-3"
      >
        <div className="w-8 h-8 rounded-xl bg-[#1c1c1c]/5 flex items-center justify-center">
          <ClipboardPlus className="w-4 h-4 text-[#1c1c1c]" />
        </div>
        <span className="text-sm font-black tracking-tight text-[#1c1c1c]">Assign a Task</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Assign a Task" maxWidth="max-w-lg">
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1.5">Assign to</label>
            <Select
              value={assigneeId}
              onChange={setAssigneeId}
              placeholder="Choose a teammate"
              options={team.map(m => ({ value: m.id, label: `${m.name || m.email}${m.designation ? ` · ${m.designation}` : ""}` }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1.5">Space</label>
              <Select value={spaceId} onChange={setSpaceId} placeholder="Choose a Space" options={spaces.map(s => ({ value: s.id, label: s.name }))} />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1.5">Board</label>
              <Select value={listId} onChange={setListId} placeholder="Choose a board" disabled={!spaceId} options={lists.map(l => ({ value: l.id, label: l.name }))} />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1.5">Title</label>
            <input className="input w-full text-sm" placeholder="e.g. Reconcile October COD payouts" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1.5">Description (optional)</label>
            <textarea className="input w-full text-sm min-h-[80px]" value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1.5">Priority</label>
              <Select value={priority} onChange={v => setPriority(v as any)} options={[
                { value: "urgent", label: "Urgent" }, { value: "high", label: "High" },
                { value: "normal", label: "Normal" }, { value: "low", label: "Low" },
              ]} />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1.5">Due date</label>
              <input type="date" className="input w-full text-sm" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>

          <button onClick={handleAssign} disabled={saving} className="btn-primary w-full py-2.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Assign Task"}
          </button>
        </div>
      </Modal>
    </>
  );
}
