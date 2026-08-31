"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List as ListIcon, Calendar as CalendarIcon, Table2, BarChart2, Plus, RefreshCw, Megaphone, Sparkles, Inbox, Zap, Settings2 } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader, AccessDenied, Modal } from "@/components/ui";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { canAccessMarketing } from "@/lib/permissions";
import { marketingApi } from "@/lib/marketing-client";
import MarketingBoard from "@/components/marketing/MarketingBoard";
import MarketingCalendar from "@/components/marketing/MarketingCalendar";
import MarketingTable from "@/components/marketing/MarketingTable";
import MarketingDashboard from "@/components/marketing/MarketingDashboard";
import AutomationsModal from "@/components/marketing/AutomationsModal";
import ListSettingsModal from "@/components/marketing/ListSettingsModal";
import TaskPanel from "@/components/marketing/TaskPanel";
import type { MktList, MktTask, Profile, MktPriority, MktTemplate, MktIntakeRequest } from "@/types";

type View = "board" | "list" | "calendar" | "table" | "dashboard";

const VIEW_ICONS: Record<View, typeof LayoutGrid> = {
  board: LayoutGrid,
  list: ListIcon,
  calendar: CalendarIcon,
  table: Table2,
  dashboard: BarChart2,
};

export default function MarketingWorkspace() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const router = useRouter();
  const sp = useSearchParams();

  const [lists, setLists] = useState<MktList[]>([]);
  const [tasks, setTasks] = useState<MktTask[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<MktTemplate[]>([]);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [allTasks, setAllTasks] = useState<MktTask[]>([]);
  const [automationsOpen, setAutomationsOpen] = useState(false);
  const [listSettingsOpen, setListSettingsOpen] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intake, setIntake] = useState<MktIntakeRequest[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<{ q: string; priority: string; assignee: string }>({
    q: "",
    priority: "",
    assignee: "",
  });

  const activeListId = sp.get("list") || lists[0]?.id || "";
  const activeList = useMemo(() => lists.find((l) => l.id === activeListId), [lists, activeListId]);
  const openTaskId = sp.get("task");

  const setQuery = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(sp.toString());
      Object.entries(next).forEach(([k, v]) => (v == null ? params.delete(k) : params.set(k, v)));
      router.replace(`/marketing?${params.toString()}`, { scroll: false });
    },
    [router, sp]
  );

  // View lives in the URL (?view=) so the sidebar can deep-link. "board" is
  // the default and carries no param.
  const ALL_VIEWS: View[] = ["board", "list", "calendar", "table", "dashboard"];
  const rawView = sp.get("view");
  const view: View = (ALL_VIEWS as string[]).includes(rawView ?? "") ? (rawView as View) : "board";
  const setView = (v: View) => setQuery({ view: v === "board" ? null : v });

  const loadLists = useCallback(async () => {
    try {
      const data = await marketingApi.listLists();
      setLists(data);
    } catch (e: any) {
      toast.error(e.message || "Could not load lists");
    }
  }, []);

  const loadTasks = useCallback(async (listId: string) => {
    if (!listId) return;
    setLoading(true);
    try {
      const data = await marketingApi.listTasks({ list_id: listId });
      setTasks(data);
    } catch (e: any) {
      toast.error(e.message || "Could not load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profileLoading || !profile) return;
    loadLists();
    createClient()
      .from("profiles")
      .select("id, name, email, role")
      .eq("is_active", true)
      .then(({ data }) => setMembers((data as Profile[]) ?? []));
  }, [profileLoading, profile, loadLists]);

  useEffect(() => {
    if (activeListId) loadTasks(activeListId);
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

  async function handleMove(taskId: string, status: string, position: number) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status, position } : t)));
    try {
      await marketingApi.reorder([{ id: taskId, status, position }]);
    } catch (e: any) {
      toast.error(e.message || "Move failed");
      loadTasks(activeListId);
    }
  }

  async function handleQuickAdd(status: string, title: string) {
    try {
      const created = await marketingApi.createTask({ list_id: activeListId, title, status });
      setTasks((prev) => [...prev, created]);
    } catch (e: any) {
      toast.error(e.message || "Could not create task");
    }
  }

  const loadIntake = useCallback(async () => {
    try {
      setIntake(await marketingApi.listIntake());
    } catch (e: any) {
      toast.error(e.message || "Could not load requests");
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
    if (tpl.kind === "task" && !activeListId) {
      toast.error("Open a list first to add these tasks");
      return;
    }
    setApplyingId(tpl.id);
    try {
      const res = await marketingApi.applyTemplate(tpl.id, tpl.kind === "task" ? activeListId : undefined);
      await loadLists();
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
    if (!name) return;
    setCreatingList(true);
    try {
      const created = await marketingApi.createList({ name });
      await loadLists();
      setQuery({ list: created.id });
      setNewListOpen(false);
      setNewListName("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreatingList(false);
    }
  }

  if (profileLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-[#5f5f5d] gap-3">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Loading workspace…</p>
      </div>
    );
  }

  if (!canAccessMarketing(profile)) {
    return <AccessDenied title="Marketing Workspace Locked" desc="Ask an admin for the marketing role or the manage_marketing permission." />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Megaphone className="w-5 h-5" /> Marketing
          </span>
        }
        subtitle="Plan, assign, and ship campaigns and content in a flow."
        actions={
          // mr clears the app-wide fixed NotificationBell (top-right, z-40)
          <div className="flex items-center gap-2 mr-10 lg:mr-14">
            <div className="flex bg-[#f2efe8] rounded-lg p-0.5">
              {(["board", "list", "calendar", "table", "dashboard"] as View[]).map((v) => {
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
              className="relative px-3 py-2 rounded-lg border border-[#eceae4] bg-white text-[#1c1c1c] text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
            >
              <Inbox className="w-3.5 h-3.5" /> Requests
              {intake.filter((r) => r.status === "new").length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                  {intake.filter((r) => r.status === "new").length}
                </span>
              )}
            </button>
            <button
              onClick={() => setAutomationsOpen(true)}
              className="px-3 py-2 rounded-lg border border-[#eceae4] bg-white text-[#1c1c1c] text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" /> Automations
            </button>
            <button
              onClick={openTemplates}
              className="px-3 py-2 rounded-lg border border-[#eceae4] bg-white text-[#1c1c1c] text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" /> Templates
            </button>
            <button
              onClick={() => setNewListOpen(true)}
              className="px-3 py-2 rounded-lg bg-[#1c1c1c] text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> List
            </button>
          </div>
        }
      />

      {/* List tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {lists.map((l) => (
          <div
            key={l.id}
            className={cn(
              "flex items-center rounded-lg text-[11px] font-bold whitespace-nowrap border transition-all",
              l.id === activeListId
                ? "bg-[#1c1c1c] text-white border-[#1c1c1c]"
                : "bg-white text-[#5f5f5d] border-[#eceae4] hover:border-[#1c1c1c]/30"
            )}
          >
            <button onClick={() => setQuery({ list: l.id })} className="px-3 py-1.5">
              {l.name}
            </button>
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
          <span className="text-[11px] text-[#5f5f5d] font-medium">No lists yet — create one to start.</span>
        )}
      </div>

      {/* Filter bar */}
      {lists.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search title…"
            className="text-xs font-medium bg-white border border-[#eceae4] rounded-lg px-3 py-2 w-48"
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
            <div className="p-8 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d]/50">
              No tasks
            </div>
          )}
          {filtered
            .slice()
            .sort((a, b) => a.status.localeCompare(b.status) || a.position - b.position)
            .map((t) => {
              const col = activeList.statuses.find((s) => s.id === t.status);
              return (
                <button
                  key={t.id}
                  onClick={() => setQuery({ task: t.id })}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#f7f4ed] text-left"
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col?.color ?? "#ccc" }} />
                  <span className="text-[13px] font-semibold text-[#1c1c1c] flex-1">{t.title}</span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#5f5f5d]">{col?.name ?? t.status}</span>
                  {t.due_date && (
                    <span className="text-[10px] font-bold text-[#5f5f5d]">
                      {new Date(t.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      )}

      <AutomationsModal open={automationsOpen} onClose={() => setAutomationsOpen(false)} list={activeList} members={members} />

      <ListSettingsModal
        open={listSettingsOpen}
        list={activeList}
        tasks={tasks}
        onClose={() => setListSettingsOpen(false)}
        onSaved={loadLists}
        onArchived={async () => {
          await loadLists();
          setQuery({ list: null });
        }}
      />

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
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d]/50 py-4 text-center">
              No templates
            </p>
          )}
          {templates.map((tpl) => {
            const taskN = Array.isArray((tpl.payload as any)?.tasks) ? (tpl.payload as any).tasks.length : 0;
            return (
              <div key={tpl.id} className="flex items-center gap-3 p-3 rounded-xl border border-[#eceae4]">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-[#1c1c1c]">{tpl.name}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d]/60">
                    {tpl.kind === "list" ? "New list" : "Add to current list"} · {taskN} task{taskN === 1 ? "" : "s"}
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
