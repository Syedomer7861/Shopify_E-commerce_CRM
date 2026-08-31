"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Trash2, Loader2, Plus, Send, Link2, Paperclip, Download, Play, Square, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import type { MktList, MktTask, MktComment, Profile, MktPriority, MktCustomField, MktTimeEntry } from "@/types";
import { marketingApi, type MktAttachment } from "@/lib/marketing-client";

const fmtMins = (m: number) => {
  if (!m) return "0m";
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return h ? `${h}h${min ? ` ${min}m` : ""}` : `${min}m`;
};

const PRIORITIES: MktPriority[] = ["urgent", "high", "normal", "low"];
const LINK_LABEL: Record<string, string> = { blocks: "Blocks", blocked_by: "Blocked by", relates_to: "Related to" };

type LinkRow = { id: string; kind: string; direction: "in" | "out"; task: { id: string; title: string; status: string; list_id: string } };

type Props = {
  taskId: string;
  list?: MktList;
  members: Profile[];
  siblingTasks?: MktTask[];
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
};

export default function TaskPanel({ taskId, list, members, siblingTasks = [], onClose, onChanged, onDeleted }: Props) {
  const [task, setTask] = useState<MktTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [comments, setComments] = useState<MktComment[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [attachments, setAttachments] = useState<MktAttachment[]>([]);
  const [activity, setActivity] = useState<Array<{ id: string; action: string; summary: string; actor_email: string | null; created_at: string }>>([]);
  const [timeEntries, setTimeEntries] = useState<MktTimeEntry[]>([]);
  const [logMins, setLogMins] = useState("");
  const [logNote, setLogNote] = useState("");
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [uploading, setUploading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [newSub, setNewSub] = useState("");
  const [linkKind, setLinkKind] = useState<"blocks" | "blocked_by" | "relates_to">("blocked_by");
  const [linkTarget, setLinkTarget] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, lk, att, act, te] = await Promise.all([
        marketingApi.getTask(taskId),
        marketingApi.listLinks(taskId).catch(() => []),
        marketingApi.listAttachments(taskId).catch(() => []),
        marketingApi.listActivity(taskId).catch(() => []),
        marketingApi.listTimeEntries(taskId).catch(() => []),
      ]);
      setTask(t);
      setComments(t.comments ?? []);
      setLinks(lk as LinkRow[]);
      setAttachments(att as MktAttachment[]);
      setActivity(act as any);
      setTimeEntries(te as MktTimeEntry[]);
    } catch (e: any) {
      toast.error(e.message || "Could not load task");
      onClose();
    } finally {
      setLoading(false);
    }
  }, [taskId, onClose]);

  // Running timer — start time lives in localStorage so it survives a
  // refresh / navigating away. Stopping it opens the log form pre-filled.
  const timerKey = `mkt-timer-${taskId}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(timerKey);
      setTimerStart(raw ? Number(raw) : null);
    } catch { /* private mode */ }
  }, [timerKey]);
  useEffect(() => {
    if (timerStart == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timerStart]);

  function startTimer() {
    const t = Date.now();
    try { localStorage.setItem(timerKey, String(t)); } catch { /* ignore */ }
    setTimerStart(t);
    setNow(t);
  }
  function stopTimer() {
    if (timerStart == null) return;
    const mins = Math.max(1, Math.round((Date.now() - timerStart) / 60000));
    try { localStorage.removeItem(timerKey); } catch { /* ignore */ }
    setTimerStart(null);
    setLogMins(String(mins));
  }

  const loggedTotal = timeEntries.reduce((s, e) => s + e.minutes, 0);

  async function submitLog() {
    const mins = Math.round(Number(logMins));
    if (!mins || mins <= 0) return toast.error("Enter minutes");
    try {
      const entry = await marketingApi.logTime(taskId, { minutes: mins, note: logNote.trim() || undefined });
      setTimeEntries((prev) => [entry, ...prev]);
      setLogMins("");
      setLogNote("");
    } catch (e: any) {
      toast.error(e.message || "Could not log time");
    }
  }
  async function removeTimeEntry(id: string) {
    const prev = timeEntries;
    setTimeEntries((p) => p.filter((e) => e.id !== id));
    try {
      await marketingApi.deleteTimeEntry(id);
    } catch (e: any) {
      toast.error(e.message || "Could not delete");
      setTimeEntries(prev);
    }
  }

  async function addLink() {
    if (!linkTarget) return;
    try {
      await marketingApi.addLink(taskId, linkTarget, linkKind);
      setLinkTarget("");
      setLinks(await marketingApi.listLinks(taskId));
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function removeLink(id: string) {
    try {
      await marketingApi.removeLink(taskId, id);
      setLinks((prev) => prev.filter((l) => l.id !== id));
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      await marketingApi.uploadAttachment(taskId, file);
      setAttachments(await marketingApi.listAttachments(taskId));
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    try {
      await marketingApi.removeAttachment(taskId, id);
    } catch (e: any) {
      toast.error(e.message);
      load();
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  async function patch(fields: Partial<MktTask>) {
    if (!task) return;
    setTask({ ...task, ...fields });
    setSaving(true);
    try {
      const updated = await marketingApi.updateTask(task.id, fields);
      setTask((prev) => (prev ? { ...prev, ...updated } : updated));
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function addSubtask() {
    const title = newSub.trim();
    if (!title || !task) return;
    setNewSub("");
    try {
      await marketingApi.createTask({ list_id: task.list_id, title, parent_task_id: task.id });
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function toggleSub(sub: MktTask) {
    const doneStatus = list?.statuses.find((s) => s.type === "done")?.id;
    const openStatus = list?.statuses.find((s) => s.type !== "done")?.id;
    if (!doneStatus || !openStatus) return;
    const next = sub.completed_at ? openStatus : doneStatus;
    try {
      await marketingApi.updateTask(sub.id, { status: next });
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function postComment() {
    const body = newComment.trim();
    if (!body || !task) return;
    const mentions = members.filter((m) => m.name && body.includes(`@${m.name}`)).map((m) => m.id);
    setNewComment("");
    try {
      const c = await marketingApi.addComment(task.id, body, mentions);
      setComments((prev) => [...prev, c]);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function remove() {
    if (!task) return;
    try {
      await marketingApi.deleteTask(task.id);
      toast.success("Task deleted");
      onDeleted();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-[#eceae4] px-5 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#5f5f5d]">
            {list?.name ?? "Task"}
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          </div>
          <div className="flex items-center gap-1">
            {confirmDelete ? (
              <button
                onClick={remove}
                className="px-2 h-8 rounded-lg bg-rose-500 text-white text-[9px] font-black uppercase tracking-widest"
              >
                Delete?
              </button>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-8 h-8 rounded-lg hover:bg-rose-50 flex items-center justify-center text-[#5f5f5d] hover:text-rose-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[#f2efe8] flex items-center justify-center text-[#5f5f5d]">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading || !task ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 animate-spin text-[#1c1c1c]" />
          </div>
        ) : (
          <div className="p-5 space-y-6">
            <textarea
              ref={titleRef}
              defaultValue={task.title}
              onBlur={(e) => e.target.value.trim() && e.target.value !== task.title && patch({ title: e.target.value.trim() })}
              rows={2}
              className="w-full text-xl font-black text-[#1c1c1c] resize-none outline-none leading-tight"
            />

            <div className="grid grid-cols-2 gap-4">
              <Field label="Status">
                <select
                  value={task.status}
                  onChange={(e) => patch({ status: e.target.value })}
                  className="w-full text-xs font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-2"
                >
                  {list?.statuses.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select
                  value={task.priority}
                  onChange={(e) => patch({ priority: e.target.value as MktPriority })}
                  className="w-full text-xs font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-2 capitalize"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <Field label="Start">
                <input
                  type="date"
                  value={task.start_date ?? ""}
                  onChange={(e) => patch({ start_date: e.target.value || null })}
                  className="w-full text-xs font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-2"
                />
              </Field>
              <Field label="Due">
                <input
                  type="date"
                  value={task.due_date ?? ""}
                  onChange={(e) => patch({ due_date: e.target.value || null })}
                  className="w-full text-xs font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-2"
                />
              </Field>
            </div>

            <Field label="Time">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    placeholder="Estimate (min)"
                    defaultValue={task.estimate_minutes ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value)));
                      if (v !== (task.estimate_minutes ?? null)) patch({ estimate_minutes: v });
                    }}
                    className="w-32 text-xs font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-2"
                  />
                  <span className="text-[11px] font-bold text-[#5f5f5d]">
                    {fmtMins(loggedTotal)} logged
                    {task.estimate_minutes ? ` / ${fmtMins(task.estimate_minutes)}` : ""}
                  </span>
                </div>
                {task.estimate_minutes ? (
                  <div className="h-1.5 rounded-full bg-[#eceae4] overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", loggedTotal > task.estimate_minutes ? "bg-rose-500" : "bg-emerald-500")}
                      style={{ width: `${Math.min(100, (loggedTotal / task.estimate_minutes) * 100)}%` }}
                    />
                  </div>
                ) : null}

                <div className="flex items-center gap-1.5 flex-wrap">
                  {timerStart == null ? (
                    <button onClick={startTimer}
                      className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-1.5 rounded-lg bg-[#1c1c1c] text-white">
                      <Play className="w-3 h-3" /> Start timer
                    </button>
                  ) : (
                    <button onClick={stopTimer}
                      className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-1.5 rounded-lg bg-rose-500 text-white">
                      <Square className="w-3 h-3" /> Stop · {fmtMins(Math.max(0, (now - timerStart) / 60000))}
                    </button>
                  )}
                  {[15, 30, 60].map((m) => (
                    <button key={m} onClick={() => setLogMins(String(m))}
                      className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-white border border-[#eceae4] text-[#5f5f5d]">
                      +{m}m
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="number" min={1} placeholder="min" value={logMins}
                    onChange={(e) => setLogMins(e.target.value)}
                    className="w-16 text-xs font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-2"
                  />
                  <input
                    placeholder="Note (optional)" value={logNote}
                    onChange={(e) => setLogNote(e.target.value)}
                    className="flex-1 min-w-0 text-xs font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-2"
                  />
                  <button onClick={submitLog}
                    className="text-[10px] font-black uppercase tracking-widest px-2.5 py-2 rounded-lg bg-[#1c1c1c] text-white flex-shrink-0">
                    Log
                  </button>
                </div>

                {timeEntries.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {timeEntries.map((e) => (
                      <div key={e.id} className="flex items-center gap-2 text-[11px]">
                        <Clock className="w-3 h-3 text-[#5f5f5d]/50 flex-shrink-0" />
                        <span className="font-bold text-[#1c1c1c] w-14 flex-shrink-0">{fmtMins(e.minutes)}</span>
                        <span className="text-[#5f5f5d]/70 flex-shrink-0">{e.spent_on.slice(5)}</span>
                        <span className="text-[#5f5f5d] truncate flex-1">
                          {e.user?.name || e.user?.email || ""}{e.note ? ` — ${e.note}` : ""}
                        </span>
                        <button onClick={() => removeTimeEntry(e.id)} className="text-[#5f5f5d]/40 hover:text-rose-500 flex-shrink-0">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Field>

            <Field label="Assignees">
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => {
                  const on = task.assignees?.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() =>
                        patch({
                          assignees: on
                            ? task.assignees.filter((x) => x !== m.id)
                            : [...(task.assignees ?? []), m.id],
                        })
                      }
                      className={cn(
                        "text-[10px] font-bold px-2 py-1 rounded-lg border transition-all",
                        on ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "bg-white text-[#5f5f5d] border-[#eceae4]"
                      )}
                    >
                      {m.name || m.email}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Repeat when done">
              <select
                value={(task.recurrence as any)?.freq ?? ""}
                onChange={(e) => patch({ recurrence: e.target.value ? ({ freq: e.target.value } as any) : null })}
                className="w-full text-xs font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-2"
              >
                <option value="">No repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              {(task.recurrence as any)?.freq && !task.due_date && (
                <p className="text-[10px] font-bold text-amber-600 mt-1">Set a due date — the next copy is scheduled from it.</p>
              )}
            </Field>

            <Field label="Tags (comma separated)">
              <input
                defaultValue={(task.tags ?? []).join(", ")}
                onBlur={(e) =>
                  patch({ tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
                }
                className="w-full text-xs font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-2"
              />
            </Field>

            {(list?.custom_fields ?? []).map((f: MktCustomField) => {
              const val = (task.custom_fields ?? {})[f.id];
              const setVal = (v: any) => patch({ custom_fields: { ...(task.custom_fields ?? {}), [f.id]: v } });
              const cls = "w-full text-xs font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-2";
              return (
                <Field key={f.id} label={f.name}>
                  {f.type === "checkbox" ? (
                    <input type="checkbox" checked={!!val} onChange={(e) => setVal(e.target.checked)} />
                  ) : f.type === "select" ? (
                    <select value={val ?? ""} onChange={(e) => setVal(e.target.value || null)} className={cls}>
                      <option value="">—</option>
                      {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === "user" ? (
                    <select value={val ?? ""} onChange={(e) => setVal(e.target.value || null)} className={cls}>
                      <option value="">—</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                    </select>
                  ) : f.type === "date" ? (
                    <input type="date" value={val ?? ""} onChange={(e) => setVal(e.target.value || null)} className={cls} />
                  ) : (
                    <input
                      type={f.type === "number" || f.type === "money" ? "number" : f.type === "url" ? "url" : "text"}
                      defaultValue={val ?? ""}
                      onBlur={(e) => setVal(e.target.value === "" ? null : f.type === "number" || f.type === "money" ? Number(e.target.value) : e.target.value)}
                      className={cls}
                    />
                  )}
                </Field>
              );
            })}

            <Field label="Description">
              <textarea
                defaultValue={task.description ?? ""}
                onBlur={(e) => e.target.value !== (task.description ?? "") && patch({ description: e.target.value || null })}
                rows={5}
                placeholder="Add detail, links, checklist notes…"
                className="w-full text-[13px] font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-xl px-3 py-2.5 resize-y"
              />
            </Field>

            <Field label={`Subtasks (${task.subtasks?.length ?? 0})`}>
              <div className="space-y-1.5">
                {task.subtasks?.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-[13px] font-medium text-[#1c1c1c]">
                    <input type="checkbox" checked={!!s.completed_at} onChange={() => toggleSub(s)} />
                    <span className={cn(s.completed_at && "line-through text-[#5f5f5d]")}>{s.title}</span>
                  </label>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    value={newSub}
                    onChange={(e) => setNewSub(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addSubtask()}
                    placeholder="New subtask"
                    className="flex-1 text-xs font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-1.5"
                  />
                  <button onClick={addSubtask} className="w-7 h-7 rounded-lg bg-[#1c1c1c] text-white flex items-center justify-center">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </Field>

            <Field label={`Attachments (${attachments.length})`}>
              <div className="space-y-1.5">
                {attachments.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-[12px]">
                    <Paperclip className="w-3 h-3 text-[#5f5f5d] flex-shrink-0" />
                    <span className="font-medium text-[#1c1c1c] truncate flex-1">{a.file_name}</span>
                    {a.url && (
                      <a href={a.url} target="_blank" rel="noreferrer" className="text-[#5f5f5d] hover:text-[#1c1c1c] flex-shrink-0">
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button onClick={() => removeAttachment(a.id)} className="text-[#5f5f5d] hover:text-rose-500 flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <label className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] hover:text-[#1c1c1c] cursor-pointer">
                  {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  {uploading ? "Uploading…" : "Add file"}
                  <input
                    type="file"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) uploadFile(f);
                    }}
                  />
                </label>
              </div>
            </Field>

            <Field label="Dependencies">
              <div className="space-y-1.5">
                {links.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 text-[12px]">
                    <Link2 className="w-3 h-3 text-[#5f5f5d] flex-shrink-0" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#5f5f5d] w-20 flex-shrink-0">
                      {LINK_LABEL[l.kind] ?? l.kind}
                    </span>
                    <span className="font-medium text-[#1c1c1c] truncate flex-1">{l.task?.title ?? "—"}</span>
                    <button onClick={() => removeLink(l.id)} className="text-[#5f5f5d] hover:text-rose-500 flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <select
                    value={linkKind}
                    onChange={(e) => setLinkKind(e.target.value as any)}
                    className="text-[10px] font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-1.5 py-1.5"
                  >
                    <option value="blocked_by">Blocked by</option>
                    <option value="blocks">Blocks</option>
                    <option value="relates_to">Related to</option>
                  </select>
                  <select
                    value={linkTarget}
                    onChange={(e) => setLinkTarget(e.target.value)}
                    className="flex-1 text-[11px] font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-1.5 py-1.5"
                  >
                    <option value="">Pick a task…</option>
                    {siblingTasks
                      .filter((s) => s.id !== taskId && !links.some((l) => l.task?.id === s.id))
                      .map((s) => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                  </select>
                  <button onClick={addLink} disabled={!linkTarget} className="w-7 h-7 rounded-lg bg-[#1c1c1c] text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </Field>

            <Field label={`Comments (${comments.length})`}>
              <div className="space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="bg-[#f7f4ed] rounded-xl p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] mb-1">
                      {c.author?.name || c.author?.email || "User"} ·{" "}
                      {new Date(c.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <p className="text-[13px] font-medium text-[#1c1c1c] whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))}
                <div className="flex items-end gap-2">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postComment();
                    }}
                    rows={2}
                    placeholder="Comment… @name to mention, ⌘/Ctrl+Enter to send"
                    className="flex-1 text-[13px] font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-xl px-3 py-2 resize-none"
                  />
                  <button onClick={postComment} className="w-9 h-9 rounded-lg bg-[#1c1c1c] text-white flex items-center justify-center flex-shrink-0">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Field>

            {activity.length > 0 && (
              <Field label="Activity">
                <div className="space-y-1.5">
                  {activity.map((a) => (
                    <div key={a.id} className="text-[11px] text-[#5f5f5d] flex gap-2">
                      <span className="text-[#5f5f5d]/50 whitespace-nowrap">
                        {new Date(a.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="font-medium text-[#1c1c1c]">{a.summary}</span>
                    </div>
                  ))}
                </div>
              </Field>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-black text-[#5f5f5d]/60 uppercase tracking-widest mb-1.5">{label}</div>
      {children}
    </div>
  );
}
