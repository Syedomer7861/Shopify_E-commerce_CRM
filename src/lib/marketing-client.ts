"use client";
import { createClient } from "@/lib/supabase";
import { MOCK_WORKSPACE, MOCK_TEAM } from "@/lib/mockData";
import type { MktList, MktTask, MktComment, MktTemplate, MktIntakeRequest, MktAutomation, MktSpace, MktSpaceMember, MktTimeEntry, MktGoal, MktCommentSnippet } from "@/types";
import { isDemoMode } from "@/lib/demo";

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

export type MktActivityEntry = {
  id: string;
  action: string;
  summary: string;
  actor_email: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
};

// Demo / presentation account: no real workspace rows and the API guard
// would 403 the demo user, so short-circuit every call with mock data and
// make writes a no-op that keeps the optimistic UI happy.
const isDemo = () => typeof document !== "undefined" && isDemoMode();
const P = <T>(v: T): Promise<T> => Promise.resolve(v);
const demoTask = (t: any): MktTask => ({ subtasks: [], comments: [], links: [], ...t });

// Thin browser-side wrapper over /api/marketing/*. Every call throws on a
// non-2xx so callers can toast the message.
async function j<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any)?.error || `Request failed (${res.status})`);
  return body as T;
}

export const marketingApi = {
  // ── Spaces ──────────────────────────────────────────────
  listSpaces: () =>
    isDemo() ? P(MOCK_WORKSPACE.spaces as MktSpace[]) : fetch("/api/marketing/spaces").then((r) => j<MktSpace[]>(r)),

  createSpace: (payload: { name: string; color?: string; icon?: string }) =>
    isDemo()
      ? P({ id: `demo-space-${Date.now()}`, name: payload.name, color: payload.color ?? null, icon: payload.icon ?? null, position: 9999, archived: false, my_role: "owner", member_count: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any)
      : fetch("/api/marketing/spaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then((r) => j<MktSpace>(r)),

  updateSpace: (id: string, patch: Partial<MktSpace>) =>
    isDemo()
      ? P({ ...(MOCK_WORKSPACE.spaces.find((s) => s.id === id) ?? {}), ...patch } as any)
      : fetch(`/api/marketing/spaces/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }).then((r) => j<MktSpace>(r)),

  deleteSpace: (id: string) =>
    isDemo() ? P({ ok: true }) : fetch(`/api/marketing/spaces/${id}`, { method: "DELETE" }).then((r) => j(r)),

  listSpaceMembers: (spaceId: string) =>
    isDemo()
      ? P(
          MOCK_TEAM.map((m, i) => ({
            space_id: spaceId,
            user_id: m.id,
            role: i === 0 ? "owner" : "member",
            created_at: new Date().toISOString(),
            user: { id: m.id, name: m.name, email: m.email, role: m.role },
          })) as any
        )
      : fetch(`/api/marketing/spaces/${spaceId}/members`).then((r) => j<MktSpaceMember[]>(r)),

  addSpaceMember: (spaceId: string, userId: string, role: "owner" | "member" = "member") =>
    isDemo()
      ? P({ space_id: spaceId, user_id: userId, role, created_at: new Date().toISOString() } as any)
      : fetch(`/api/marketing/spaces/${spaceId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, role }),
        }).then((r) => j<MktSpaceMember>(r)),

  removeSpaceMember: (spaceId: string, userId: string) =>
    isDemo()
      ? P({ ok: true })
      : fetch(`/api/marketing/spaces/${spaceId}/members?user_id=${userId}`, { method: "DELETE" }).then((r) => j(r)),

  // ── Lists ───────────────────────────────────────────────
  listLists: (spaceId?: string, includeArchived = false) => {
    if (isDemo()) return P(MOCK_WORKSPACE.lists.filter((l) => !spaceId || l.space_id === spaceId) as MktList[]);
    const qs = new URLSearchParams();
    if (spaceId) qs.set("space_id", spaceId);
    if (includeArchived) qs.set("archived", "1");
    return fetch(`/api/marketing/lists?${qs.toString()}`).then((r) => j<MktList[]>(r));
  },

  createList: (payload: Partial<MktList> & { space_id: string }) =>
    isDemo()
      ? P({ id: `demo-list-${Date.now()}`, space_id: payload.space_id, name: payload.name ?? "New list", color: null, icon: null, position: 9999, archived: false, statuses: (MOCK_WORKSPACE.lists[0] as any).statuses, wip_limit: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any)
      : fetch("/api/marketing/lists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then((r) => j<MktList>(r)),

  updateList: (id: string, patch: Partial<MktList>) =>
    isDemo()
      ? P({ ...(MOCK_WORKSPACE.lists.find((l) => l.id === id) ?? {}), ...patch } as any)
      : fetch(`/api/marketing/lists/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }).then((r) => j<MktList>(r)),

  archiveList: (id: string) =>
    isDemo() ? P({ ok: true }) : fetch(`/api/marketing/lists/${id}`, { method: "DELETE" }).then((r) => j(r)),

  listTasks: (params: Record<string, string | undefined>) => {
    if (isDemo()) {
      const all = MOCK_WORKSPACE.tasks as MktTask[];
      return P(params.list_id ? all.filter((t) => t.list_id === params.list_id) : all);
    }
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && qs.set(k, v));
    return fetch(`/api/marketing/tasks?${qs.toString()}`).then((r) => j<MktTask[]>(r));
  },

  getTask: (id: string) =>
    isDemo()
      ? P(demoTask(MOCK_WORKSPACE.tasks.find((t) => t.id === id) ?? MOCK_WORKSPACE.tasks[0]))
      : fetch(`/api/marketing/tasks/${id}`).then((r) => j<MktTask>(r)),

  createTask: (payload: Partial<MktTask>) =>
    isDemo()
      ? P(demoTask({ id: `demo-task-${Date.now()}`, priority: "normal", assignees: [], watchers: [], tags: [], custom_fields: {}, position: 9999, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), completed_at: null, ...payload }))
      : fetch("/api/marketing/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then((r) => j<MktTask>(r)),

  updateTask: (id: string, patch: Partial<MktTask>) =>
    isDemo()
      ? P(demoTask({ ...(MOCK_WORKSPACE.tasks.find((t) => t.id === id) ?? {}), id, ...patch }))
      : fetch(`/api/marketing/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }).then((r) => j<MktTask>(r)),

  deleteTask: (id: string) =>
    isDemo() ? P({ ok: true }) : fetch(`/api/marketing/tasks/${id}`, { method: "DELETE" }).then((r) => j(r)),

  bulk: (ids: string[], action: "update" | "delete", patch?: Record<string, any>) =>
    isDemo()
      ? P({ ok: true, updated: ids.length })
      : fetch("/api/marketing/tasks/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, action, patch }),
        }).then((r) => j(r)),

  reorder: (items: Array<{ id: string; list_id?: string; status?: string; position: number }>) =>
    isDemo()
      ? P({ ok: true })
      : fetch("/api/marketing/tasks/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        }).then((r) => j(r)),

  listLinks: (taskId: string) =>
    isDemo()
      ? P([] as Array<{ id: string; kind: string; direction: "in" | "out"; task: { id: string; title: string; status: string; list_id: string } }>)
      : fetch(`/api/marketing/tasks/${taskId}/links`).then((r) =>
          j<Array<{ id: string; kind: string; direction: "in" | "out"; task: { id: string; title: string; status: string; list_id: string } }>>(r)
        ),

  addLink: (taskId: string, targetTaskId: string, kind: "blocks" | "blocked_by" | "relates_to") =>
    isDemo()
      ? P({ id: `demo-link-${Date.now()}`, kind })
      : fetch(`/api/marketing/tasks/${taskId}/links`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_task_id: targetTaskId, kind }),
        }).then((r) => j(r)),

  removeLink: (taskId: string, linkId: string) =>
    isDemo() ? P({ ok: true }) : fetch(`/api/marketing/tasks/${taskId}/links?link_id=${linkId}`, { method: "DELETE" }).then((r) => j(r)),

  listActivity: (taskId: string) =>
    isDemo()
      ? P([] as MktActivityEntry[])
      : fetch(`/api/marketing/tasks/${taskId}/activity`).then((r) => j<MktActivityEntry[]>(r)),

  listComments: (taskId: string) =>
    isDemo() ? P([] as MktComment[]) : fetch(`/api/marketing/tasks/${taskId}/comments`).then((r) => j<MktComment[]>(r)),

  addComment: (taskId: string, body: string, mentions: string[] = []) =>
    isDemo()
      ? P({ id: `demo-c-${Date.now()}`, task_id: taskId, author_id: MOCK_TEAM[0].id, body, mentions, created_at: new Date().toISOString(), author: { id: MOCK_TEAM[0].id, name: MOCK_TEAM[0].name, email: MOCK_TEAM[0].email } } as any)
      : fetch(`/api/marketing/tasks/${taskId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, mentions }),
        }).then((r) => j<MktComment>(r)),

  // ── Goals ───────────────────────────────────────────────
  listGoals: (spaceId: string) =>
    isDemo()
      ? P([] as MktGoal[])
      : fetch(`/api/marketing/goals?space_id=${spaceId}`).then((r) => j<MktGoal[]>(r)),

  createGoal: (payload: { space_id: string; title: string; target: number; period_start: string; period_end: string; owner_id?: string | null }) =>
    isDemo()
      ? P({ id: `demo-goal-${Date.now()}`, progress: 0, metric: "tasks_done", created_at: new Date().toISOString(), ...payload } as MktGoal)
      : fetch("/api/marketing/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then((r) => j<MktGoal>(r)),

  updateGoal: (id: string, patch: Partial<Pick<MktGoal, "title" | "target" | "period_start" | "period_end" | "owner_id">>) =>
    isDemo()
      ? P({ id, ...patch } as MktGoal)
      : fetch(`/api/marketing/goals/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }).then((r) => j<MktGoal>(r)),

  deleteGoal: (id: string) =>
    isDemo() ? P({ ok: true }) : fetch(`/api/marketing/goals/${id}`, { method: "DELETE" }).then((r) => j(r)),

  // ── Comment snippets ("/" canned messages) ──────────────
  listSnippets: () =>
    isDemo()
      ? P([
          { id: "demo-sn-1", title: "Approved", body: "Approved — good to proceed. ✅", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { id: "demo-sn-2", title: "Needs changes", body: "Needs a few changes before this can move forward:\n- ", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        ] as MktCommentSnippet[])
      : fetch("/api/marketing/snippets").then((r) => j<MktCommentSnippet[]>(r)),

  createSnippet: (payload: { title: string; body: string }) =>
    isDemo()
      ? P({ id: `demo-sn-${Date.now()}`, ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as MktCommentSnippet)
      : fetch("/api/marketing/snippets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then((r) => j<MktCommentSnippet>(r)),

  updateSnippet: (id: string, patch: { title?: string; body?: string }) =>
    isDemo()
      ? P({ id, ...patch } as MktCommentSnippet)
      : fetch(`/api/marketing/snippets/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }).then((r) => j<MktCommentSnippet>(r)),

  deleteSnippet: (id: string) =>
    isDemo() ? P({ ok: true }) : fetch(`/api/marketing/snippets/${id}`, { method: "DELETE" }).then((r) => j(r)),

  // ── Time tracking ───────────────────────────────────────
  listTimeEntries: (taskId: string) =>
    isDemo()
      ? P([] as MktTimeEntry[])
      : fetch(`/api/marketing/tasks/${taskId}/time`).then((r) => j<MktTimeEntry[]>(r)),

  logTime: (taskId: string, payload: { minutes: number; note?: string; spent_on?: string }) =>
    isDemo()
      ? P({ id: `demo-te-${Date.now()}`, task_id: taskId, user_id: MOCK_TEAM[0].id, minutes: payload.minutes, note: payload.note ?? null, spent_on: new Date().toISOString().slice(0, 10), created_at: new Date().toISOString(), user: { id: MOCK_TEAM[0].id, name: MOCK_TEAM[0].name, email: MOCK_TEAM[0].email } } as MktTimeEntry)
      : fetch(`/api/marketing/tasks/${taskId}/time`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then((r) => j<MktTimeEntry>(r)),

  deleteTimeEntry: (id: string) =>
    isDemo() ? P({ ok: true }) : fetch(`/api/marketing/time/${id}`, { method: "DELETE" }).then((r) => j(r)),

  listTemplates: (kind?: "task" | "list") =>
    isDemo()
      ? P([
          { id: "demo-tpl-1", name: "Blog post", kind: "list", payload: { tasks: new Array(7).fill(0) }, created_at: new Date().toISOString() },
          { id: "demo-tpl-2", name: "Ad campaign setup", kind: "list", payload: { tasks: new Array(10).fill(0) }, created_at: new Date().toISOString() },
          { id: "demo-tpl-3", name: "Weekly content sprint", kind: "task", payload: { tasks: new Array(5).fill(0) }, created_at: new Date().toISOString() },
        ].filter((t) => !kind || t.kind === kind) as any)
      : fetch(`/api/marketing/templates${kind ? `?kind=${kind}` : ""}`).then((r) => j<MktTemplate[]>(r)),

  applyTemplate: (templateId: string, opts: { listId?: string; spaceId?: string }) =>
    isDemo()
      ? P({ taskCount: 6, list: undefined, list_id: opts.listId })
      : fetch("/api/marketing/templates/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template_id: templateId, list_id: opts.listId, space_id: opts.spaceId }),
        }).then((r) => j<{ list?: MktList; list_id?: string; taskCount: number }>(r)),

  // opts.mine forces the caller's own requests only (the personal follow-up
  // page); omitted, workspace staff get the whole intake queue.
  listIntake: (opts?: { mine?: boolean }) =>
    isDemo()
      ? P([] as MktIntakeRequest[])
      : fetch(`/api/marketing/intake${opts?.mine ? "?scope=mine" : ""}`).then((r) => j<MktIntakeRequest[]>(r)),

  submitIntake: (payload: { title: string; details?: string; desired_date?: string | null; ref?: Record<string, any> }) =>
    isDemo()
      ? P({ id: `demo-intake-${Date.now()}`, status: "new", title: payload.title, created_at: new Date().toISOString() } as any)
      : fetch("/api/marketing/intake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then((r) => j<MktIntakeRequest>(r)),

  resolveIntake: (id: string, status: "accepted" | "rejected", listId?: string) =>
    isDemo()
      ? P({ id, status } as any)
      : fetch(`/api/marketing/intake/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, list_id: listId }),
        }).then((r) => j<MktIntakeRequest>(r)),

  listAutomations: (listId?: string) =>
    isDemo()
      ? P([
          { id: "demo-auto-1", list_id: null, name: "Route to review", enabled: true, trigger: { event: "status_changed", to: "review" }, actions: [{ type: "notify" }], created_at: new Date().toISOString() },
        ] as any)
      : fetch(`/api/marketing/automations${listId ? `?list_id=${listId}` : ""}`).then((r) => j<MktAutomation[]>(r)),

  createAutomation: (payload: Partial<MktAutomation>) =>
    isDemo()
      ? P({ id: `demo-auto-${Date.now()}`, enabled: true, created_at: new Date().toISOString(), ...payload } as any)
      : fetch("/api/marketing/automations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then((r) => j<MktAutomation>(r)),

  updateAutomation: (id: string, patch: Partial<MktAutomation>) =>
    isDemo()
      ? P({ id, ...patch } as any)
      : fetch(`/api/marketing/automations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }).then((r) => j<MktAutomation>(r)),

  deleteAutomation: (id: string) =>
    isDemo() ? P({ ok: true }) : fetch(`/api/marketing/automations/${id}`, { method: "DELETE" }).then((r) => j(r)),

  listAttachments: (taskId: string) =>
    isDemo() ? P([] as MktAttachment[]) : fetch(`/api/marketing/tasks/${taskId}/attachments`).then((r) => j<MktAttachment[]>(r)),

  uploadAttachment: async (taskId: string, file: File) => {
    if (isDemo()) {
      return P({ id: `demo-att-${Date.now()}`, task_id: taskId, file_name: file.name, storage_path: "", mime: file.type || null, size_bytes: file.size, created_at: new Date().toISOString(), url: null } as MktAttachment);
    }
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
    isDemo() ? P({ ok: true }) : fetch(`/api/marketing/tasks/${taskId}/attachments?attachment_id=${id}`, { method: "DELETE" }).then((r) => j(r)),
};

// Fractional index between two positions, for drag-drop drops.
export function midPosition(before?: number, after?: number): number {
  if (before == null && after == null) return 1000;
  if (before == null) return (after as number) - 1000;
  if (after == null) return before + 1000;
  return (before + after) / 2;
}
