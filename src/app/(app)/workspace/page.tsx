"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isDemoMode } from "@/lib/demo";
import {
  LayoutGrid, List as ListIcon, Calendar as CalendarIcon, Table2, BarChart2,
  Plus, RefreshCw, Layers, Sparkles, Inbox, Zap, Settings2, Target,
} from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader, AccessDenied, Modal } from "@/components/ui";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { marketingApi } from "@/lib/marketing-client";
import MarketingBoard from "@/components/marketing/MarketingBoard";
import MarketingCalendar from "@/components/marketing/MarketingCalendar";
import MarketingTable from "@/components/marketing/MarketingTable";
import MarketingDashboard from "@/components/marketing/MarketingDashboard";
import AutomationsModal from "@/components/marketing/AutomationsModal";
import ListSettingsModal from "@/components/marketing/ListSettingsModal";
import SpaceSettingsModal from "@/components/marketing/SpaceSettingsModal";
import GoalsModal from "@/components/marketing/GoalsModal";
import TaskPanel from "@/components/marketing/TaskPanel";
import type { MktList, MktTask, Profile, MktPriority, MktTemplate, MktIntakeRequest, MktSpace } from "@/types";

type View = "board" | "list" | "calendar" | "table" | "dashboard";

const VIEW_ICONS: Record<View, typeof LayoutGrid> = {
  board: LayoutGrid,
  list: ListIcon,
  calendar: CalendarIcon,
  table: Table2,
  dashboard: BarChart2,
};

export default function WorkspacePage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const router = useRouter();
  const sp = useSearchParams();

  const [spaces, setSpaces] = useState<MktSpace[]>([]);
  const [spacesLoaded, setSpacesLoaded] = useState(false);
  const [lists, setLists] = useState<MktList[]>([]);
  const [tasks, setTasks] = useState<MktTask[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [spaceSettingsOpen, setSpaceSettingsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<MktTemplate[]>([]);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [allTasks, setAllTasks] = useState<MktTask[]>([]);
  const [automationsOpen, setAutomationsOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [listSettingsOpen, setListSettingsOpen] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intake, setIntake] = useState<MktIntakeRequest[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<{ q: string; priority: string; assignee: string }>({
    q: "", priority: "", assignee: "",
  });
  const [groupBy, setGroupBy] = useState<"status" | "assignee" | "priority">("status");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const wsAdmin = isWorkspaceAdmin(profile);
  const activeSpaceId = sp.get("space") || spaces[0]?.id || "";
  const activeSpace = useMemo(() => spaces.find((s) => s.id === activeSpaceId), [spaces, activeSpaceId]);
  const canManageSpace = wsAdmin || activeSpace?.my_role === "owner";

  const activeListId = sp.get("list") || lists[0]?.id || "";
  const activeList = useMemo(() => lists.find((l) => l.id === activeListId), [lists, activeListId]);
  const openTaskId = sp.get("task");

  const setQuery = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(sp.toString());
      Object.entries(next).forEach(([k, v]) => (v == null ? params.delete(k) : params.set(k, v)));
      router.replace(`/workspace?${params.toString()}`, { scroll: false });
    },
    [router, sp]
  );

  const ALL_VIEWS: View[] = ["board", "list", "calendar", "table", "dashboard"];
  const rawView = sp.get("view");
  const view: View = (ALL_VIEWS as string[]).includes(rawView ?? "") ? (rawView as View) : "board";
  const setView = (v: View) => setQuery({ view: v === "board" ? null : v });

  const loadSpaces = useCallback(async () => {
    try {
      setSpaces(await marketingApi.listSpaces());
    } catch (e: any) {
      // A non-member legitimately has no Spaces — fall through to the empty
      // state instead of a scary "Forbidden" toast. Only surface real errors.
      const msg = String(e?.message || "");
      if (!/forbidden|not a member|403/i.test(msg)) toast.error(msg || "Could not load spaces");
      setSpaces([]);
    } finally {
      setSpacesLoaded(true);
    }
  }, []);

  const loadLists = useCallback(async (spaceId: string) => {
    if (!spaceId) { setLists([]); return; }
    try {
      setLists(await marketingApi.listLists(spaceId));
    } catch (e: any) {
      toast.error(e.message || "Could not load lists");
    }
  }, []);

  const loadTasks = useCallback(async (listId: string) => {
    if (!listId) { setTasks([]); setLoading(false); return; }
    setLoading(true);
    try {
      setTasks(await marketingApi.listTasks({ list_id: listId }));
    } catch (e: any) {
      toast.error(e.message || "Could not load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profileLoading || !profile) return;
    loadSpaces();
    if (typeof document !== "undefined" && isDemoMode()) {
      import("@/lib/mockData").then((m) => setMembers(m.MOCK_TEAM as unknown as Profile[]));
      return;
    }
    createClient()
      .from("profiles")
      .select("id, name, email, role")
      .eq("is_active", true)
      .then(({ data }) => setMembers((data as Profile[]) ?? []));
  }, [profileLoading, profile, loadSpaces]);

  useEffect(() => {
    if (spacesLoaded) loadLists(activeSpaceId);
  }, [spacesLoaded, activeSpaceId, loadLists]);

  useEffect(() => {
    loadTasks(activeListId);
    setSelected(new Set());
  }, [activeListId, loadTasks]);

  // Live board: refetch when a teammate changes a task in this list. Scoped
  // filter keeps the subscription cheap. Skipped in demo (no real table).
  useEffect(() => {
    if (!activeListId) return;
    if (typeof document !== "undefined" && isDemoMode()) return;
    let t: any;
    const bump = () => {
      clearTimeout(t);
      t = setTimeout(() => loadTasks(activeListId), 400);
    };
    const ch = createClient()
      .channel(`wsp-tasks-${activeListId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkt_tasks", filter: `list_id=eq.${activeListId}` }, bump)
      .subscribe();
    return () => {
      clearTimeout(t);
      createClient().removeChannel(ch);
    };
  }, [activeListId, loadTasks]);

  useEffect(() => {
    if (view !== "dashboard" || !profile) return;
    marketingApi
      .listTasks({})
      .then(setAllTasks)
      .catch((e) => toast.error(e.message || "Could not load dashboard data"));
  }, [view, profile]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filters.q && !t.title.toLowerCase().includes(filters.q.toLowerCase())) return false;
      if (filters.priority && t.priority !== filters.priority) return false;
      if (filters.assignee && !t.assignees?.includes(filters.assignee)) return false;
      return true;
    });
  }, [tasks, filters]);

  // Board columns + the per-task group key, driven by groupBy.
  const PRIORITY_COLS = [
    { id: "urgent", name: "Urgent", color: "#f43f5e" },
    { id: "high", name: "High", color: "#f59e0b" },
    { id: "normal", name: "Normal", color: "#94a3b8" },
    { id: "low", name: "Low", color: "#cbd5e1" },
  ];
  const boardColumns = useMemo(() => {
    if (groupBy === "priority") return PRIORITY_COLS;
    if (groupBy === "assignee")
      return [
        ...members.map((m) => ({ id: m.id, name: m.name || m.email || "?", color: "#3b82f6" })),
        { id: "__none", name: "Unassigned", color: "#94a3b8" },
      ];
    return (activeList?.statuses ?? []).map((s) => ({ id: s.id, name: s.name, color: s.color }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, members, activeList]);
  const groupOf = (t: MktTask) =>
    groupBy === "priority" ? t.priority : groupBy === "assignee" ? (t.assignees?.[0] ?? "__none") : t.status;

  async function handleMove(taskId: string, columnId: string, position: number) {
    if (groupBy === "status") {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: columnId, position } : t)));
      try {
        await marketingApi.reorder([{ id: taskId, status: columnId, position }]);
      } catch (e: any) {
        toast.error(e.message || "Move failed");
        loadTasks(activeListId);
      }
      return;
    }
    const patch =
      groupBy === "priority"
        ? { priority: columnId as MktPriority }
        : { assignees: columnId === "__none" ? [] : [columnId] };
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
    try {
      await marketingApi.updateTask(taskId, patch);
    } catch (e: any) {
      toast.error(e.message || "Move failed");
      loadTasks(activeListId);
    }
  }

  async function handleQuickAdd(columnId: string, title: string) {
    const extra: Partial<MktTask> =
      groupBy === "priority"
        ? { priority: columnId as MktPriority }
        : groupBy === "assignee"
        ? { assignees: columnId === "__none" ? [] : [columnId] }
        : { status: columnId };
    try {
      const created = await marketingApi.createTask({ list_id: activeListId, title, ...extra });
      setTasks((prev) => [...prev, created]);
    } catch (e: any) {
      toast.error(e.message || "Could not create task");
    }
  }

  async function bulkApply(patch: Record<string, any>) {
    const ids = [...selected];
    try {
      await marketingApi.bulk(ids, "update", patch);
      setSelected(new Set());
      loadTasks(activeListId);
      toast.success(`Updated ${ids.length}`);
    } catch (e: any) {
      toast.error(e.message || "Bulk update failed");
    }
  }
  const [confirmBulkDel, setConfirmBulkDel] = useState(false);
  async function bulkDelete() {
    if (!confirmBulkDel) { setConfirmBulkDel(true); setTimeout(() => setConfirmBulkDel(false), 3000); return; }
    const ids = [...selected];
    setConfirmBulkDel(false);
    try {
      await marketingApi.bulk(ids, "delete");
      setSelected(new Set());
      loadTasks(activeListId);
      toast.success(`Deleted ${ids.length}`);
    } catch (e: any) {
      toast.error(e.message || "Bulk delete failed");
    }
  }
  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const loadIntake = useCallback(async () => {
    try {
      setIntake(await marketingApi.listIntake());
    } catch {
      /* intake queue is optional for non-marketing spaces */
    }
  }, []);

  useEffect(() => {
    if (!profile) return;
    loadIntake();
    if (sp.get("intake") === "1") setIntakeOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function resolveIntake(id: string, status: "accepted" | "rejected") {
    setResolvingId(id);
    try {
      await marketingApi.resolveIntake(id, status, status === "accepted" ? activeListId || undefined : undefined);
      await loadIntake();
      if (status === "accepted") loadTasks(activeListId);
      toast.success(`Request ${status}`);
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setResolvingId(null);
    }
  }

  async function openTemplates() {
    setTemplatesOpen(true);
    try {
      setTemplates(await marketingApi.listTemplates());
    } catch (e: any) {
      toast.error(e.message || "Could not load templates");
    }
  }

  async function applyTemplate(tpl: MktTemplate) {
    if (tpl.kind === "task" && !activeListId) return toast.error("Open a list first to add these tasks");
    if (tpl.kind === "list" && !activeSpaceId) return toast.error("Pick a Space first");
    setApplyingId(tpl.id);
    try {
      const res = await marketingApi.applyTemplate(tpl.id, { listId: activeListId, spaceId: activeSpaceId });
      await loadLists(activeSpaceId);
      if (res.list?.id) setQuery({ list: res.list.id });
      else loadTasks(activeListId);
      setTemplatesOpen(false);
      toast.success(`Added ${res.taskCount} task${res.taskCount === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e.message || "Apply failed");
    } finally {
      setApplyingId(null);
    }
  }

  async function handleNewList() {
    const name = newListName.trim();
    if (!name || !activeSpaceId) return;
    setCreatingList(true);
    try {
      const created = await marketingApi.createList({ space_id: activeSpaceId, name });
      await loadLists(activeSpaceId);
      setQuery({ list: created.id });
      setNewListOpen(false);
      setNewListName("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreatingList(false);
    }
  }

  async function handleNewSpace() {
    const name = newSpaceName.trim();
    if (!name) return;
    setCreatingSpace(true);
    try {
      const created = await marketingApi.createSpace({ name });
      await loadSpaces();
      setQuery({ space: created.id, list: null });
      setNewSpaceOpen(false);
      setNewSpaceName("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreatingSpace(false);
    }
  }

  if (profileLoading || !spacesLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-[#5f5f5d] gap-3">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Loading workspace…</p>
      </div>
    );
  }

  if (spaces.length === 0) {
    return wsAdmin ? (
      <div className="max-w-md mx-auto text-center py-20 space-y-4">
        <Layers className="w-10 h-10 text-[#5f5f5d]/40 mx-auto" />
        <h2 className="text-lg font-black text-[#1c1c1c]">No Spaces yet</h2>
        <p className="text-[13px] text-[#5f5f5d] font-medium">A Space is a team&apos;s area — Marketing, Amazon Ops, Ads…</p>
        <button
          onClick={() => setNewSpaceOpen(true)}
          className="px-4 py-2.5 rounded-lg bg-[#1c1c1c] text-white text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" /> Create a Space
        </button>
        <Modal open={newSpaceOpen} onClose={() => setNewSpaceOpen(false)} title="New Space" maxWidth="max-w-sm">
          <div className="space-y-4">
            <input
              autoFocus
              value={newSpaceName}
              onChange={(e) => setNewSpaceName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNewSpace()}
              placeholder="e.g. Marketing, Amazon Ops"
              className="w-full text-sm font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-3 py-2.5"
            />
            <button
              onClick={handleNewSpace}
              disabled={creatingSpace || !newSpaceName.trim()}
              className="w-full py-3 rounded-lg bg-[#1c1c1c] text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
            >
              {creatingSpace ? "Creating…" : "Create Space"}
            </button>
          </div>
        </Modal>
      </div>
    ) : (
      <AccessDenied title="No workspace access" desc="Ask a Space owner or an admin to add you to a Space." />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={<span className="flex items-center gap-2"><Layers className="w-5 h-5" /> {activeSpace?.name ?? "Workspace"}</span>}
        subtitle="Plan, assign, and move work through a flow."
        actions={
          <div className="flex flex-wrap items-center gap-1.5 lg:mr-14">
            <div className="flex bg-[#f2efe8] rounded-lg p-0.5 overflow-x-auto max-w-full">
              {(ALL_VIEWS).map((v) => {
                const Icon = VIEW_ICONS[v];
                return (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5",
                      view === v ? "bg-white text-[#1c1c1c] shadow-sm" : "text-[#5f5f5d]"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{v}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setIntakeOpen(true)}
              title="Creative requests"
              className="relative px-2.5 py-2 rounded-lg border border-[#eceae4] bg-white text-[#1c1c1c] text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
            >
              <Inbox className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Requests</span>
              {intake.filter((r) => r.status === "new").length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                  {intake.filter((r) => r.status === "new").length}
                </span>
              )}
            </button>
            <button
              onClick={() => setAutomationsOpen(true)}
              title="Automations"
              className="px-2.5 py-2 rounded-lg border border-[#eceae4] bg-white text-[#1c1c1c] text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Automations</span>
            </button>
            <button
              onClick={() => setGoalsOpen(true)}
              title="Goals"
              disabled={!activeSpaceId}
              className="px-2.5 py-2 rounded-lg border border-[#eceae4] bg-white text-[#1c1c1c] text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40"
            >
              <Target className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Goals</span>
            </button>
            <button
              onClick={openTemplates}
              title="Templates"
              className="px-2.5 py-2 rounded-lg border border-[#eceae4] bg-white text-[#1c1c1c] text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Templates</span>
            </button>
            <button
              onClick={() => setNewListOpen(true)}
              title="New list"
              className="px-2.5 py-2 rounded-lg bg-[#1c1c1c] text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">List</span>
            </button>
          </div>
        }
      />

      {/* Space switcher */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {spaces.map((s) => (
          <div
            key={s.id}
            className={cn(
              "flex items-center rounded-lg text-[11px] font-black uppercase tracking-widest whitespace-nowrap border transition-all",
              s.id === activeSpaceId ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "bg-white text-[#5f5f5d] border-[#eceae4] hover:border-[#1c1c1c]/30"
            )}
          >
            <button onClick={() => setQuery({ space: s.id, list: null })} className="px-3 py-1.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color ?? "#8b8b8b" }} />
              {s.name}
            </button>
            {s.id === activeSpaceId && canManageSpace && (
              <button
                onClick={() => setSpaceSettingsOpen(true)}
                aria-label="Space settings"
                className="pr-2.5 pl-0.5 py-1.5 text-white/60 hover:text-white"
              >
                <Settings2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {wsAdmin && (
          <button
            onClick={() => setNewSpaceOpen(true)}
            className="px-2.5 py-1.5 rounded-lg border border-dashed border-[#eceae4] text-[#5f5f5d] text-[11px] font-black uppercase tracking-widest hover:border-[#1c1c1c]/30 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Space
          </button>
        )}
      </div>

      {/* List tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {lists.map((l) => (
          <div
            key={l.id}
            className={cn(
              "flex items-center rounded-lg text-[11px] font-bold whitespace-nowrap border transition-all",
              l.id === activeListId ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "bg-white text-[#5f5f5d] border-[#eceae4] hover:border-[#1c1c1c]/30"
            )}
          >
            <button onClick={() => setQuery({ list: l.id })} className="px-3 py-1.5">{l.name}</button>
            {l.id === activeListId && (
              <button
                onClick={() => setListSettingsOpen(true)}
                aria-label="List settings"
                className="pr-2.5 pl-0.5 py-1.5 text-white/60 hover:text-white"
              >
                <Settings2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {lists.length === 0 && (
          <span className="text-[11px] text-[#5f5f5d] font-medium">No lists in this Space yet — create one to start.</span>
        )}
      </div>

      {/* Filter bar */}
      {lists.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search title…"
            className="text-xs font-medium bg-white border border-[#eceae4] rounded-lg px-3 py-2 w-full sm:w-48"
          />
          <select
            value={filters.priority}
            onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
            className="text-xs font-bold bg-white border border-[#eceae4] rounded-lg px-2 py-2"
          >
            <option value="">Any priority</option>
            {(["urgent", "high", "normal", "low"] as MktPriority[]).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={filters.assignee}
            onChange={(e) => setFilters((f) => ({ ...f, assignee: e.target.value }))}
            className="text-xs font-bold bg-white border border-[#eceae4] rounded-lg px-2 py-2"
          >
            <option value="">Anyone</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name || m.email}</option>
            ))}
          </select>
          {(filters.q || filters.priority || filters.assignee) && (
            <button
              onClick={() => setFilters({ q: "", priority: "", assignee: "" })}
              className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] hover:text-[#1c1c1c]"
            >
              Clear
            </button>
          )}
          {view === "board" && (
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
              className="text-xs font-bold bg-white border border-[#eceae4] rounded-lg px-2 py-2 sm:ml-auto"
              title="Group board by"
            >
              <option value="status">Group: Status</option>
              <option value="assignee">Group: Assignee</option>
              <option value="priority">Group: Priority</option>
            </select>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-[#1c1c1c] text-white rounded-xl px-3 py-2 text-[11px] font-bold">
          <span className="uppercase tracking-widest text-[10px]">{selected.size} selected</span>
          <select onChange={(e) => e.target.value && bulkApply({ assignees: [e.target.value] })} defaultValue="" className="bg-[#2a2a2a] rounded px-2 py-1 text-white">
            <option value="">Assign…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
          </select>
          <select onChange={(e) => e.target.value && bulkApply({ status: e.target.value })} defaultValue="" className="bg-[#2a2a2a] rounded px-2 py-1 text-white">
            <option value="">Status…</option>
            {(activeList?.statuses ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select onChange={(e) => e.target.value && bulkApply({ priority: e.target.value })} defaultValue="" className="bg-[#2a2a2a] rounded px-2 py-1 text-white capitalize">
            <option value="">Priority…</option>
            {["urgent", "high", "normal", "low"].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={bulkDelete} className="bg-rose-500 rounded px-2 py-1 uppercase tracking-widest text-[10px]">{confirmBulkDel ? "Sure?" : "Delete"}</button>
          <button onClick={() => setSelected(new Set())} className="text-white/60 uppercase tracking-widest text-[10px]">Clear</button>
        </div>
      )}

      {view === "dashboard" ? (
        <MarketingDashboard lists={lists} tasks={allTasks} members={members} />
      ) : loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-[#1c1c1c]" />
        </div>
      ) : !activeList ? null : view === "board" ? (
        <MarketingBoard
          list={activeList}
          tasks={filtered}
          columns={boardColumns}
          groupOf={groupOf}
          showWip={groupBy === "status"}
          onOpenTask={(id) => setQuery({ task: id })}
          onMove={handleMove}
          onQuickAdd={handleQuickAdd}
        />
      ) : view === "calendar" ? (
        <MarketingCalendar list={activeList} tasks={filtered} onOpenTask={(id) => setQuery({ task: id })} />
      ) : view === "table" ? (
        <MarketingTable list={activeList} tasks={filtered} members={members} onOpenTask={(id) => setQuery({ task: id })} />
      ) : (
        <div className="bg-white border border-[#eceae4] rounded-2xl divide-y divide-[#eceae4]">
          {filtered.length === 0 && (
            <div className="p-8 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d]/50">No tasks</div>
          )}
          {filtered
            .slice()
            .sort((a, b) => a.status.localeCompare(b.status) || a.position - b.position)
            .map((t) => {
              const col = activeList.statuses.find((s) => s.id === t.status);
              return (
                <div key={t.id} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#f7f4ed]">
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggleSel(t.id)}
                    className="flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button onClick={() => setQuery({ task: t.id })} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col?.color ?? "#ccc" }} />
                    <span className="text-[13px] font-semibold text-[#1c1c1c] flex-1 truncate">{t.title}</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#5f5f5d]">{col?.name ?? t.status}</span>
                    {t.due_date && (
                      <span className="text-[10px] font-bold text-[#5f5f5d]">
                        {new Date(t.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
        </div>
      )}

      <AutomationsModal open={automationsOpen} onClose={() => setAutomationsOpen(false)} list={activeList} lists={lists} members={members} />

      <GoalsModal
        open={goalsOpen}
        spaceId={activeSpaceId}
        canManage={canManageSpace}
        members={members}
        onClose={() => setGoalsOpen(false)}
      />

      <ListSettingsModal
        open={listSettingsOpen}
        list={activeList}
        tasks={tasks}
        onClose={() => setListSettingsOpen(false)}
        onSaved={() => loadLists(activeSpaceId)}
        onArchived={async () => {
          await loadLists(activeSpaceId);
          setQuery({ list: null });
        }}
      />

      <SpaceSettingsModal
        open={spaceSettingsOpen}
        space={activeSpace}
        members={members}
        canManage={canManageSpace}
        onClose={() => setSpaceSettingsOpen(false)}
        onSaved={loadSpaces}
        onArchived={async () => {
          await loadSpaces();
          setQuery({ space: null, list: null });
        }}
      />

      <Modal open={newSpaceOpen} onClose={() => setNewSpaceOpen(false)} title="New Space" maxWidth="max-w-sm">
        <div className="space-y-4">
          <input
            autoFocus
            value={newSpaceName}
            onChange={(e) => setNewSpaceName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNewSpace()}
            placeholder="e.g. Marketing, Amazon Ops"
            className="w-full text-sm font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-3 py-2.5"
          />
          <button
            onClick={handleNewSpace}
            disabled={creatingSpace || !newSpaceName.trim()}
            className="w-full py-3 rounded-lg bg-[#1c1c1c] text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
          >
            {creatingSpace ? "Creating…" : "Create Space"}
          </button>
        </div>
      </Modal>

      <Modal open={intakeOpen} onClose={() => setIntakeOpen(false)} title="Creative requests" maxWidth="max-w-lg">
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {intake.length === 0 && (
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d]/50 py-6 text-center">No requests</p>
          )}
          {intake.map((r) => (
            <div
              key={r.id}
              className={cn(
                "p-3 rounded-xl border",
                r.status === "new" ? "border-[#eceae4] bg-white" : "border-[#eceae4]/60 bg-[#faf8f3] opacity-70"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-[#1c1c1c]">{r.title}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d]/60 mt-0.5">
                    {r.requester?.name || r.requester?.email || "Someone"}
                    {r.desired_date ? ` · by ${new Date(r.desired_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
                    {r.status !== "new" ? ` · ${r.status}` : ""}
                  </div>
                </div>
                {r.status === "new" && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => resolveIntake(r.id, "accepted")}
                      disabled={resolvingId === r.id}
                      className="px-2 py-1 rounded-lg bg-[#1c1c1c] text-white text-[9px] font-black uppercase tracking-widest disabled:opacity-40"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => resolveIntake(r.id, "rejected")}
                      disabled={resolvingId === r.id}
                      className="px-2 py-1 rounded-lg border border-[#eceae4] text-[#5f5f5d] text-[9px] font-black uppercase tracking-widest disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
              {r.details && <p className="text-[11px] font-medium text-[#5f5f5d] mt-2 whitespace-pre-wrap">{r.details}</p>}
            </div>
          ))}
          <p className="text-[10px] font-medium text-[#5f5f5d]/60 pt-2">
            Accepted requests become a task in <span className="font-bold">{activeList?.name ?? "the current list"}</span>.
          </p>
        </div>
      </Modal>

      <Modal open={templatesOpen} onClose={() => setTemplatesOpen(false)} title="Templates" maxWidth="max-w-md">
        <div className="space-y-2">
          {templates.length === 0 && (
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d]/50 py-4 text-center">No templates</p>
          )}
          {templates.map((tpl) => {
            const taskN = Array.isArray((tpl.payload as any)?.tasks) ? (tpl.payload as any).tasks.length : 0;
            return (
              <div key={tpl.id} className="flex items-center gap-3 p-3 rounded-xl border border-[#eceae4]">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-[#1c1c1c]">{tpl.name}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d]/60">
                    {tpl.kind === "list" ? "New list in this Space" : "Add to current list"} · {taskN} task{taskN === 1 ? "" : "s"}
                  </div>
                </div>
                <button
                  onClick={() => applyTemplate(tpl)}
                  disabled={applyingId === tpl.id}
                  className="px-3 py-1.5 rounded-lg bg-[#1c1c1c] text-white text-[9px] font-black uppercase tracking-widest disabled:opacity-40"
                >
                  {applyingId === tpl.id ? "…" : "Use"}
                </button>
              </div>
            );
          })}
        </div>
      </Modal>

      <Modal open={newListOpen} onClose={() => setNewListOpen(false)} title="New list" maxWidth="max-w-sm">
        <div className="space-y-4">
          <input
            autoFocus
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNewList()}
            placeholder="e.g. Paid Ads, Blog, Social"
            className="w-full text-sm font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-3 py-2.5"
          />
          <button
            onClick={handleNewList}
            disabled={creatingList || !newListName.trim()}
            className="w-full py-3 rounded-lg bg-[#1c1c1c] text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
          >
            {creatingList ? "Creating…" : "Create list"}
          </button>
        </div>
      </Modal>

      {openTaskId && (
        <TaskPanel
          taskId={openTaskId}
          list={activeList}
          members={members}
          siblingTasks={tasks}
          onClose={() => setQuery({ task: null })}
          onChanged={() => loadTasks(activeListId)}
          onDeleted={() => {
            setQuery({ task: null });
            loadTasks(activeListId);
          }}
        />
      )}
    </div>
  );
}
