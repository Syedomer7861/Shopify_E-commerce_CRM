"use client";
import { createClient } from "@/lib/supabase";
import type { MktList, MktTask, MktComment, MktTemplate, MktIntakeRequest, MktAutomation } from "@/types";

export type MktAttachment = {
  id: string;
  task_id: string;
  file_name: string;
  storage_path: string;
  mime: string | null;
  size_bytes: number | null;
  created_at: string;
  url: string | null;
};

const ATTACH_BUCKET = "mkt-attachments";

// Thin browser-side wrapper over /api/marketing/*. Every call throws on a
// non-2xx so callers can toast the message.
async function j<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any)?.error || `Request failed (${res.status})`);
  return body as T;
}

export const marketingApi = {
  listLists: (includeArchived = false) =>
    fetch(`/api/marketing/lists${includeArchived ? "?archived=1" : ""}`).then((r) => j<MktList[]>(r)),

  createList: (payload: Partial<MktList>) =>
    fetch("/api/marketing/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => j<MktList>(r)),

  updateList: (id: string, patch: Partial<MktList>) =>
    fetch(`/api/marketing/lists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => j<MktList>(r)),

  archiveList: (id: string) => fetch(`/api/marketing/lists/${id}`, { method: "DELETE" }).then((r) => j(r)),

  listTasks: (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && qs.set(k, v));
    return fetch(`/api/marketing/tasks?${qs.toString()}`).then((r) => j<MktTask[]>(r));
  },

  getTask: (id: string) => fetch(`/api/marketing/tasks/${id}`).then((r) => j<MktTask>(r)),

  createTask: (payload: Partial<MktTask>) =>
    fetch("/api/marketing/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => j<MktTask>(r)),

  updateTask: (id: string, patch: Partial<MktTask>) =>
    fetch(`/api/marketing/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => j<MktTask>(r)),

  deleteTask: (id: string) => fetch(`/api/marketing/tasks/${id}`, { method: "DELETE" }).then((r) => j(r)),

  reorder: (items: Array<{ id: string; list_id?: string; status?: string; position: number }>) =>
    fetch("/api/marketing/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    }).then((r) => j(r)),

  listLinks: (taskId: string) =>
    fetch(`/api/marketing/tasks/${taskId}/links`).then((r) =>
      j<Array<{ id: string; kind: string; direction: "in" | "out"; task: { id: string; title: string; status: string; list_id: string } }>>(r)
    ),

  addLink: (taskId: string, targetTaskId: string, kind: "blocks" | "blocked_by" | "relates_to") =>
    fetch(`/api/marketing/tasks/${taskId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_task_id: targetTaskId, kind }),
    }).then((r) => j(r)),

  removeLink: (taskId: string, linkId: string) =>
    fetch(`/api/marketing/tasks/${taskId}/links?link_id=${linkId}`, { method: "DELETE" }).then((r) => j(r)),

  listComments: (taskId: string) =>
    fetch(`/api/marketing/tasks/${taskId}/comments`).then((r) => j<MktComment[]>(r)),

  addComment: (taskId: string, body: string, mentions: string[] = []) =>
    fetch(`/api/marketing/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, mentions }),
    }).then((r) => j<MktComment>(r)),

  listTemplates: (kind?: "task" | "list") =>
    fetch(`/api/marketing/templates${kind ? `?kind=${kind}` : ""}`).then((r) => j<MktTemplate[]>(r)),

  applyTemplate: (templateId: string, listId?: string) =>
    fetch("/api/marketing/templates/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: templateId, list_id: listId }),
    }).then((r) => j<{ list?: MktList; list_id?: string; taskCount: number }>(r)),

  listIntake: () => fetch("/api/marketing/intake").then((r) => j<MktIntakeRequest[]>(r)),

  submitIntake: (payload: { title: string; details?: string; desired_date?: string | null; ref?: Record<string, any> }) =>
    fetch("/api/marketing/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => j<MktIntakeRequest>(r)),

  resolveIntake: (id: string, status: "accepted" | "rejected", listId?: string) =>
    fetch(`/api/marketing/intake/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, list_id: listId }),
    }).then((r) => j<MktIntakeRequest>(r)),

  listAutomations: (listId?: string) =>
    fetch(`/api/marketing/automations${listId ? `?list_id=${listId}` : ""}`).then((r) => j<MktAutomation[]>(r)),

  createAutomation: (payload: Partial<MktAutomation>) =>
    fetch("/api/marketing/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => j<MktAutomation>(r)),

  updateAutomation: (id: string, patch: Partial<MktAutomation>) =>
    fetch(`/api/marketing/automations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => j<MktAutomation>(r)),

  deleteAutomation: (id: string) =>
    fetch(`/api/marketing/automations/${id}`, { method: "DELETE" }).then((r) => j(r)),

  listAttachments: (taskId: string) =>
    fetch(`/api/marketing/tasks/${taskId}/attachments`).then((r) => j<MktAttachment[]>(r)),

  uploadAttachment: async (taskId: string, file: File) => {
    const ext = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
    const path = `${taskId}/${crypto.randomUUID()}${ext}`;
    const { error } = await createClient().storage.from(ATTACH_BUCKET).upload(path, file, { upsert: false });
    if (error) throw new Error(error.message);
    return fetch(`/api/marketing/tasks/${taskId}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_name: file.name, storage_path: path, mime: file.type || null, size_bytes: file.size }),
    }).then((r) => j<MktAttachment>(r));
  },

  removeAttachment: (taskId: string, id: string) =>
    fetch(`/api/marketing/tasks/${taskId}/attachments?attachment_id=${id}`, { method: "DELETE" }).then((r) => j(r)),
};

// Fractional index between two positions, for drag-drop drops.
export function midPosition(before?: number, after?: number): number {
  if (before == null && after == null) return 1000;
  if (before == null) return (after as number) - 1000;
  if (after == null) return before + 1000;
  return (before + after) / 2;
}
