"use client";
import { useEffect, useState, useCallback } from "react";
import { Shield, User, Loader2, Mail, Trash2, Edit2, UserPlus, CheckCircle2, XCircle, ShoppingBag, Users, MessageSquare, Eye, Search, Filter } from "lucide-react";
import { PageHeader, Avatar, EmptyState, Modal } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import type { Profile, UserPermissions } from "@/types";
import { AccessDenied } from "@/components/ui";
import { DEFAULT_PERMISSIONS, NAV_MODULE_GROUPS, ALL_NAV_MODULES, allowedNavModules, normalizePermissions, hasPermission } from "@/lib/permissions";
import { isDemoMode } from "@/lib/demo";
import type { Role } from "@/types";
import { INDIAN_STATES } from "@/components/hr/EmployeeDirectory";

// Short blurb for the system roles seeded by Phase 2a; any other role
// (admin-created) just reads as "Custom role".
const ROLE_BLURBS: Record<string, string> = {
  agent: "Sales Only", hr: "Staffing", manager: "Operations",
  marketing: "Boards & Campaigns", admin: "Full System",
};
// Demo mode never hits the DB, so the role picker needs something to
// render — same 5 roles/permissions Phase 2a seeded into the real table.
const FALLBACK_ROLES: Role[] = [
  { id: "agent", org_id: "", name: "agent", is_system: true, permissions: DEFAULT_PERMISSIONS, nav_modules: null, created_at: "" },
  { id: "hr", org_id: "", name: "hr", is_system: true, permissions: { ...DEFAULT_PERMISSIONS, view_analytics: true }, nav_modules: null, created_at: "" },
  { id: "manager", org_id: "", name: "manager", is_system: true, permissions: { view_analytics: true, can_import: true, can_delete: false, manage_team: true, manage_orders: true, manage_customers: true, send_whatsapp: true, audit_tasks: true, manage_automations: true, manage_marketing: true, manage_workspaces: true }, nav_modules: null, created_at: "" },
  { id: "marketing", org_id: "", name: "marketing", is_system: true, permissions: { view_analytics: true, can_import: false, can_delete: false, manage_team: false, manage_orders: false, manage_customers: true, send_whatsapp: true, audit_tasks: false, manage_automations: false, manage_marketing: true, manage_workspaces: false, nav_modules: ["my-hub", "chat", "request-creative"] }, nav_modules: ["my-hub", "chat", "request-creative"], created_at: "" },
  { id: "admin", org_id: "", name: "admin", is_system: true, permissions: {} as UserPermissions, nav_modules: null, created_at: "" },
];

const NAV_MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard", tasks: "Tasks", chat: "Chat", "my-hub": "My Hub",
  customers: "Customers", orders: "Orders", calendar: "Calendar",
  performance: "Performance", "request-creative": "Request Creative",
  floor: "Live Floor", reports: "Analytics", "abandoned-carts": "Abandoned Carts",
  "admin-logs": "Alert Logs", recordings: "Recordings", import: "Import",
  campaigns: "Campaigns", templates: "Templates", workflows: "Workflows",
  "system-health": "System Health", settings: "Settings",
  team: "Team", hr: "HR", manager: "Manager Hub",
};
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { logAuditEvent } from "@/lib/audit";

import { createTeamMemberServer, updateTeamMemberPasswordServer, deleteTeamMemberServer } from "@/app/actions/admin";

export default function TeamPage() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [editModal, setEditModal] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Seats from the plan (null limit = unlimited). Enforced by the database.
  const [seats, setSeats] = useState<{ limit: number | null; used: number } | null>(null);

  // New user state
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // New user state
  const [newUser, setNewUser] = useState({ email: "", password: "", name: "", role: "agent" });
  const { profile: currentProfile, loading: profileLoading } = useCurrentProfile();

  const supabase = createClient();
  const loadSeats = useCallback(() => {
    supabase.rpc("my_seat_status").then(({ data }) => setSeats((data as { limit: number | null; used: number } | null) ?? null));
  }, [supabase]);
  useEffect(() => { loadSeats(); }, [loadSeats, profiles]);
  const seatsFull = seats?.limit != null && seats.used >= seats.limit;

  const fetchProfiles = useCallback(async () => {
    const isDemo = isDemoMode();
    if (isDemo) {
      setLoading(true);
      const { MOCK_TEAM } = await import("@/lib/mockData");
      setProfiles(MOCK_TEAM as unknown as Profile[]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) {
        toast.error(error.message);
      } else {
        // Filter: HR should not see Admins in Team Directory. Only Admins see everyone.
        const filtered = (data || []).filter(p => {
          if (currentProfile?.role === 'admin') return true;
          return p.role !== 'admin';
        });
        setProfiles(filtered);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [supabase, currentProfile?.role]);

  const fetchRoles = useCallback(async () => {
    if (isDemoMode()) return;
    const { data, error } = await supabase
      .from("roles")
      .select("*")
      .order("created_at", { ascending: true });
    if (!error && data) setRoles(data as Role[]);
  }, [supabase]);

  useEffect(() => {
    if (!profileLoading) {
      fetchProfiles();
      fetchRoles();
    }
  }, [profileLoading, currentProfile?.id, fetchProfiles, fetchRoles]);

  // Roles table (Phase 2a) is the live source; FALLBACK_ROLES only covers
  // demo mode or the brief window before the fetch above resolves.
  const roleOptions = roles.length > 0 ? roles : FALLBACK_ROLES;

  async function handleAddMember() {
    if (!newUser.email || !newUser.password) return toast.error("Email and Password are required");
    if (newUser.password.length < 6) return toast.error("Password must be at least 6 characters");

    const isDemo = isDemoMode();
    if (isDemo) {
      toast.success("Demo: Team member created (local only)");
      setAddModal(false);
      setNewUser({ email: "", password: "", name: "", role: "agent" });
      return;
    }

    setIsUpdating(true);

    const res = await createTeamMemberServer({
      email: newUser.email,
      password: newUser.password,
      name: newUser.name,
      role: newUser.role,
      permissions: (roleOptions.find(r => r.name === newUser.role)?.permissions as UserPermissions) || DEFAULT_PERMISSIONS,
    });

    if (!res.success) {
      toast.error(res.error || "Failed to create user");
    } else {
      await logAuditEvent({
        entityType: "profile",
        entityId: newUser.email,
        action: "create",
        summary: `Created team member ${newUser.email} with role ${newUser.role}`,
      });
      toast.success("Team member created successfully!");
      fetchProfiles();
      setAddModal(false);
      setNewUser({ email: "", password: "", name: "", role: "agent" });
    }
    setIsUpdating(false);
  }

  async function handleRemoveMember(id: string) {
    if (!confirm("Are you sure you want to remove this team member? This action will permanently delete their account and access. This cannot be undone.")) return;

    const isDemo = isDemoMode();
    if (isDemo) {
      toast.success("Demo: Team member removed (local only)");
      setProfiles(prev => prev.filter(p => p.id !== id));
      return;
    }

    setIsUpdating(true);
    const res = await deleteTeamMemberServer(id);
    
    if (!res.success) {
      toast.error(res.error || "Failed to remove member");
    } else {
      await logAuditEvent({
        entityType: "profile",
        entityId: id,
        action: "delete",
        summary: "Permanently deleted team member account and profile",
      });
      toast.success("Member completely removed from system");
      fetchProfiles();
    }
    setIsUpdating(false);
  }

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Bulk activate / deactivate. Kept to the safe, fully-reversible ops —
  // bulk delete stays one-at-a-time on purpose.
  async function bulkSetActive(active: boolean) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    const isDemo = isDemoMode();
    if (isDemo) {
      setProfiles(prev => prev.map(p => ids.includes(p.id) ? { ...p, is_active: active } : p));
      setSelectedIds(new Set());
      toast.success(`Demo: ${ids.length} member(s) ${active ? "activated" : "deactivated"}`);
      return;
    }

    setBulkBusy(true);
    const { error } = await supabase.from("profiles").update({ is_active: active }).in("id", ids);
    if (error) {
      toast.error(error.message);
    } else {
      await logAuditEvent({
        entityType: "profile",
        entityId: ids.join(","),
        action: "update",
        summary: `Bulk ${active ? "activated" : "deactivated"} ${ids.length} team member(s)`,
      });
      toast.success(`${ids.length} member(s) ${active ? "activated" : "deactivated"}`);
      setSelectedIds(new Set());
      fetchProfiles();
    }
    setBulkBusy(false);
  }

  async function updateProfile(updates: Partial<Profile>) {
    if (!selectedProfile) return;

    const isDemo = isDemoMode();
    if (isDemo) {
      toast.success("Demo: Settings updated (local only)");
      setProfiles(prev => prev.map(p => p.id === selectedProfile.id ? { ...p, ...updates } : p));
      setSelectedProfile(prev => prev ? { ...prev, ...updates } : null);
      return;
    }

    setIsUpdating(true);

    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", selectedProfile.id);

    if (error) {
      toast.error(error.message);
    } else {
      await logAuditEvent({
        entityType: "profile",
        entityId: selectedProfile.id,
        action: "update",
        summary: `Updated profile settings for ${selectedProfile.email}`,
        metadata: updates as any,
      });
      toast.success("Settings updated");
      fetchProfiles();
      // Update selected profile in modal too
      setSelectedProfile(prev => prev ? { ...prev, ...updates } : null);
    }
    setIsUpdating(false);
  }

  const togglePermission = (key: keyof UserPermissions) => {
    if (!selectedProfile) return;
    // Seed from the role-aware effective set so a manager/hr/marketing user
    // whose row is thin doesn't get reset to the agent default on first toggle.
    const current = { ...normalizePermissions(selectedProfile), ...(selectedProfile.permissions || {}) };
    const updated = { ...current, [key]: !current[key] };
    updateProfile({ permissions: updated });
  };

  // Main-menu visibility. Absent nav_modules = every module (the default);
  // touching a checkbox materialises the implicit "all" then edits it.
  const toggleModule = (key: string) => {
    if (!selectedProfile) return;
    const perms = selectedProfile.permissions || DEFAULT_PERMISSIONS;
    const cur: string[] = Array.isArray(perms.nav_modules)
      ? perms.nav_modules
      : (allowedNavModules(selectedProfile) ?? [...ALL_NAV_MODULES]);
    const next = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key];
    updateProfile({ permissions: { ...perms, nav_modules: next } });
  };
  const resetModules = () => {
    if (!selectedProfile) return;
    const perms = { ...(selectedProfile.permissions || DEFAULT_PERMISSIONS) };
    delete (perms as any).nav_modules;
    updateProfile({ permissions: perms });
  };

  const toggleSpecialization = (type: 'segments' | 'tasks' | 'states', value: string) => {
    if (!selectedProfile) return;
    const field = type === 'segments' ? 'assigned_segments' : type === 'tasks' ? 'assigned_task_types' : 'assigned_states';
    const current = (selectedProfile[field] || []) as string[];
    const updated = current.includes(value) 
      ? current.filter(v => v !== value) 
      : [...current, value];
    
    updateProfile({ [field]: updated.length === 0 ? null : updated });
  };

  const [newUpdatePassword, setNewUpdatePassword] = useState("");
  const [newRevenueTarget, setNewRevenueTarget] = useState("");

  async function handleUpdatePassword() {
    if (!selectedProfile) return;
    if (newUpdatePassword.length < 6) return toast.error("Password must be at least 6 characters");

    const isDemo = isDemoMode();
    if (isDemo) {
      toast.success("Demo: Password reset simulated (local only)");
      setNewUpdatePassword("");
      return;
    }

    setIsUpdating(true);
    const res = await updateTeamMemberPasswordServer(selectedProfile.id, newUpdatePassword);
    if (!res.success) {
      toast.error(res.error || "Failed to update password");
    } else {
      await logAuditEvent({
        entityType: "profile",
        entityId: selectedProfile.id,
        action: "update_password",
        summary: `Admin explicitly reset password for ${selectedProfile.email}`,
      });
      toast.success("Password overwritten successfully");
      setNewUpdatePassword("");
    }
    setIsUpdating(false);
  }

  async function handleUpdateRevenueTarget() {
    if (!selectedProfile) return;
    const target = Number(newRevenueTarget);
    if (isNaN(target) || target < 0) return toast.error("Enter a valid target amount");
    await updateProfile({ weekly_revenue_target: target } as any);
  }

  if (profileLoading) {
    return <div className="py-12 text-center text-gray-400">Loading permissions...</div>;
  }

  if (!hasPermission(currentProfile, "manage_team")) {
    return <AccessDenied title="Team Management Locked" desc="Only admins or users with team-management access can manage accounts." />;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader 
        title="Team Management" 
        subtitle={seats?.limit != null
          ? `${seats.used} of ${seats.limit} team members on your plan${seatsFull ? " — deactivate someone or upgrade to add more" : ""}`
          : `${profiles.filter(p => p.is_active).length} active members`}
        actions={
          <button onClick={() => setAddModal(true)} disabled={seatsFull} title={seatsFull ? "All seats on your plan are in use" : undefined} className="btn-primary gap-2 disabled:opacity-50">
            <UserPlus className="w-4 h-4" /> Add Member
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by name or email..." 
            className="input pl-10 h-11 bg-white border-gray-100 shadow-sm"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex p-1 bg-gray-100 rounded-xl w-fit max-w-full overflow-x-auto scrollbar-hide">
          {["all", ...roleOptions.map(r => r.name), "demo"].map(role => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={cn(
                "px-4 py-1.5 text-xs font-bold rounded-lg transition-all capitalize",
                roleFilter === role 
                  ? "bg-white text-[#1c1c1c] shadow-sm" 
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {role === "demo" ? "Demo Accounts" : role}
            </button>
          ))}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-xl bg-[#1c1c1c] text-white">
          <span className="text-xs font-bold">{selectedIds.size} selected</span>
          <button onClick={() => bulkSetActive(true)} disabled={bulkBusy}
            className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40">
            {bulkBusy ? "…" : "Activate"}
          </button>
          <button onClick={() => bulkSetActive(false)} disabled={bulkBusy}
            className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40">
            {bulkBusy ? "…" : "Deactivate"}
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg hover:bg-white/10 ml-auto">
            Clear
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-12 text-center text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading team profiles...
          </div>
        ) : profiles.length === 0 ? (
          <div className="col-span-full">
            <EmptyState icon={<User className="w-5 h-5" />} title="No profiles found" desc="Invite team members to get started." />
          </div>
        ) : (
          profiles
            .filter(p => {
              const matchesSearch = (p.name || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
                                   p.email.toLowerCase().includes(searchTerm.toLowerCase());
              const matchesRole = roleFilter === "all" || 
                                  (roleFilter === "demo" ? p.is_demo : p.role === roleFilter);
              return matchesSearch && matchesRole;
            })
            .map(p => {
            const lastSeen = (p as any).last_seen_at;
            const isOnline = lastSeen && (Date.now() - new Date(lastSeen).getTime()) < 60 * 1000;
            const isRecent = lastSeen && (Date.now() - new Date(lastSeen).getTime()) < 60 * 60 * 1000;
            
            function getPresenceLabel() {
              if (!p.is_active) return "Disabled";
              if (!lastSeen) return "Never logged in";
              const diff = Date.now() - new Date(lastSeen).getTime();
              const mins = Math.floor(diff / 60000);
              if (mins < 1) return "Online now";
              if (mins < 60) return `Last seen ${mins}m ago`;
              const hrs = Math.floor(mins / 60);
              if (hrs < 24) return `Last seen ${hrs}h ago`;
              const days = Math.floor(hrs / 24);
              return `Last seen ${days}d ago`;
            }
            
            const presenceLabel = getPresenceLabel();
            const dotColor = !p.is_active ? "bg-gray-400" : isOnline ? "bg-[#1c1c1c]" : isRecent ? "bg-amber-400" : "bg-rose-400";
            
            return (
            <div 
              key={p.id} 
              className={`card p-4 hover:shadow-md transition-all group border-l-4 cursor-pointer ${p.is_active ? 'border-l-transparent hover:border-l-[#1c1c1c]' : 'border-l-gray-200 opacity-60'}`}
              onClick={(e) => {
                // Don't trigger if clicking buttons inside
                if ((e.target as HTMLElement).closest('button')) return;
                window.open(`/team/${p.id}`, '_blank');
              }}
            >
               <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => toggleSelected(p.id)}
                    aria-label={selectedIds.has(p.id) ? "Deselect" : "Select"}
                    className={cn(
                      "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all",
                      selectedIds.has(p.id) ? "bg-[#1c1c1c] border-[#1c1c1c] text-white" : "border-gray-200 hover:border-gray-400"
                    )}
                  >
                    {selectedIds.has(p.id) && <CheckCircle2 className="w-2.5 h-2.5" />}
                  </button>
                  <div className="relative">
                    <Avatar name={p.name || p.email} size="md" />
                    <div className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white", dotColor, isOnline && "animate-pulse")} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {p.is_demo && (
                    <div className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-700 border-amber-500/20 shadow-sm animate-fade-in">
                      Demo
                    </div>
                  )}
                  <div className={cn(
                    "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                    p.role === 'admin' && "bg-zinc-900 text-white border-zinc-900",
                    p.role === 'manager' && "bg-violet-50 text-violet-700 border-violet-100",
                    p.role === 'marketing' && "bg-blue-50 text-blue-700 border-blue-100",
                    p.role === 'hr' && "bg-rose-50 text-rose-700 border-rose-100",
                    p.role === 'agent' && "bg-emerald-50 text-emerald-700 border-emerald-100"
                  )}>
                    {p.role === 'hr' ? 'HR' : p.role === 'marketing' ? 'Workspace' : p.role}
                  </div>
                  <button aria-label="Delete" onClick={() => handleRemoveMember(p.id)} className="p-1.5 text-gray-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="mb-4">
                <div className="text-sm font-semibold text-[#1c1c1c] truncate flex items-center gap-2">
                  {p.name || "Pending Signup"}
                  {!p.is_active && <XCircle className="w-3 h-3 text-rose-500" />}
                </div>
                <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                  <Mail className="w-3 h-3" /> {p.email}
                </div>
                <div className={cn(
                  "text-[10px] font-bold mt-1.5 flex items-center gap-1.5",
                  isOnline ? "text-[#1c1c1c]" : isRecent ? "text-amber-600" : "text-gray-400"
                )}>
                  <div className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />
                  {presenceLabel}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-3 border-t border-gray-50">
                <button 
                  onClick={() => { setSelectedProfile(p); setNewUpdatePassword(""); setNewRevenueTarget(String((p as any).weekly_revenue_target || "")); setEditModal(true); }}
                  className="flex-1 btn-secondary py-1.5 text-xs gap-1.5"
                >
                  <Edit2 className="w-3 h-3" /> Edit Permissions
                </button>

              </div>
            </div>
            );
          })

        )}
      </div>

      {/* Add Member Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Create Team Account">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Email Address (Login ID)</label>
            <input type="email" className="input" placeholder="agent@yourcompany.com"
              value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Set Password</label>
            <input type="password" title="Set Password" name="new-password" placeholder="••••••" className="input" 
              value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Full Name</label>
            <input type="text" className="input" placeholder="John Doe" 
              value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Initial Role</label>
            <select className="select" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
              {roleOptions.map(r => (
                <option key={r.name} value={r.name}>
                  {r.name.charAt(0).toUpperCase() + r.name.slice(1)}{ROLE_BLURBS[r.name] ? ` (${ROLE_BLURBS[r.name]})` : ""}
                </option>
              ))}
            </select>
          </div>
          <button onClick={handleAddMember} disabled={isUpdating} className="btn-primary w-full py-2.5 mt-2">
            {isUpdating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Create Account"}
          </button>
        </div>
      </Modal>

      {/* Edit Permission Modal */}
      <Modal 
        open={editModal} 
        onClose={() => setEditModal(false)} 
        title="Access Control"
        footer={<button className="btn-secondary w-full" onClick={() => setEditModal(false)}>Close</button>}
      >
        <div className="space-y-5">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
             <div className="flex items-center gap-3">
               <Avatar name={selectedProfile?.name || selectedProfile?.email || ""} size="sm" />
               <div>
                  <div className="text-xs font-bold text-[#1c1c1c]">{selectedProfile?.name || "Pending User"}</div>
                  <div className="text-[10px] text-gray-400">{selectedProfile?.email}</div>
               </div>
             </div>
             <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium text-gray-400">Active</span>
                  <button 
                    onClick={() => updateProfile({ is_active: !selectedProfile?.is_active })}
                    disabled={isUpdating}
                    className={`w-8 h-4 rounded-full relative transition-colors ${selectedProfile?.is_active ? 'bg-emerald-500' : 'bg-gray-200'}`}
                  >
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${selectedProfile?.is_active ? 'left-4.5' : 'left-0.5'}`} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium text-gray-400">Demo Account</span>
                  <button 
                    onClick={() => updateProfile({ is_demo: !selectedProfile?.is_demo })}
                    disabled={isUpdating}
                    className={`w-8 h-4 rounded-full relative transition-colors ${selectedProfile?.is_demo ? 'bg-amber-500' : 'bg-gray-200'}`}
                  >
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${selectedProfile?.is_demo ? 'left-4.5' : 'left-0.5'}`} />
                  </button>
                </div>
             </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Security Role</label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {roleOptions.map(r => (
                <button
                  key={r.name}
                  onClick={() => updateProfile(r.name === "admin"
                    ? { role: r.name }
                    : { role: r.name, permissions: r.permissions })}
                  className={`p-3 rounded-lg border text-left transition-all ${selectedProfile?.role === r.name ? 'border-[#1c1c1c] bg-[#1c1c1c]/5' : 'border-gray-100 hover:border-gray-200'}`}
                >
                  <div className={`text-xs font-bold capitalize ${selectedProfile?.role === r.name ? 'text-[#1c1c1c]' : 'text-gray-600'}`}>{r.name}</div>
                  <div className="text-[9px] text-gray-400 mt-0.5">{ROLE_BLURBS[r.name] || "Custom role"}</div>
                </button>
              ))}
            </div>
          </div>
          
          <div className="space-y-3">
             <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Specific Permissions</label>
             <div className="space-y-2">
                {[
                  { key: "view_analytics", label: "View Reports & Analytics", icon: Eye },
                  { key: "can_import", label: "Import & Export Data", icon: Shield },
                  { key: "can_delete", label: "Delete Records (Customers/Orders)", icon: Trash2 },
                  { key: "manage_team", label: "Manage Team & Roles", icon: UserPlus },
                  { key: "manage_orders", label: "Manage Orders & Shipments", icon: ShoppingBag },
                  { key: "manage_customers", label: "Manage Customers & Segments", icon: Users },
                  { key: "send_whatsapp", label: "Send WhatsApp Messages", icon: MessageSquare },
                  { key: "audit_tasks", label: "Manager Oversight (Audit Tasks)", icon: Shield },
                  { key: "manage_automations", label: "Manage Automations & Workflows", icon: Shield },
                  { key: "manage_workspaces", label: "Workspace Admin (create/manage Spaces)", icon: Users },
                ].map((perm) => {
                  const isAdmin = selectedProfile?.role === "admin";
                  // Show the EFFECTIVE state (role default merged with any
                  // per-user override), matching what the app actually enforces.
                  const has = isAdmin || (normalizePermissions(selectedProfile) as any)?.[perm.key];
                  return (
                    <button 
                      key={perm.key} 
                      onClick={() => togglePermission(perm.key as any)}
                      disabled={isAdmin || isUpdating}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left group/perm",
                        has ? 'border-[#1c1c1c]/20 bg-[#1c1c1c]/5' : 'border-gray-100 hover:border-gray-200'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <perm.icon className={`w-3.5 h-3.5 ${has ? 'text-[#1c1c1c]' : 'text-gray-300'}`} />
                        <span className={`text-xs font-medium ${has ? 'text-[#1c1c1c]' : 'text-gray-500'}`}>{perm.label}</span>
                      </div>
                      <div 
                        className={`w-5 h-5 rounded flex items-center justify-center transition-all ${has ? 'bg-[#1c1c1c] text-white' : 'border-2 border-gray-100'}`}
                      >
                        {has && <CheckCircle2 className="w-3 h-3" />}
                      </div>
                    </button>
                  );
                })}
             </div>
             {selectedProfile?.role === "admin" && (
               <p className="text-[9px] text-gray-400 italic text-center">Administrators have all permissions by default.</p>
             )}
          </div>

          {/* Module Access — which Main-Menu items appear in this user's
              sidebar. Unset = all visible. A Workspace-role user defaults to
              a locked-down subset; widen it here per user. */}
          {selectedProfile?.role !== "admin" && (
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Module Access</label>
                {Array.isArray(selectedProfile?.permissions?.nav_modules) && (
                  <button onClick={resetModules} disabled={isUpdating}
                    className="text-[9px] font-black text-rose-500 uppercase tracking-widest hover:underline">
                    Reset to all
                  </button>
                )}
              </div>
              <p className="text-[9px] text-gray-400 leading-tight">
                {Array.isArray(selectedProfile?.permissions?.nav_modules)
                  ? "Only the checked pages show in this user's sidebar; typing a URL for the rest redirects away. Pages still enforce their own permission checks on top."
                  : allowedNavModules(selectedProfile)
                    ? "Workspace role: locked to the checked pages by default. Check more to widen this user's access."
                    : "All pages visible (default). Uncheck any to restrict this user to a subset."}
              </p>
              {Object.entries(NAV_MODULE_GROUPS).map(([group, keys]) => (
                <div key={group} className="space-y-1.5">
                  <div className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{group}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {keys.map((key) => {
                      const list = selectedProfile?.permissions?.nav_modules;
                      const effective = allowedNavModules(selectedProfile);
                      const has = Array.isArray(list)
                        ? list.includes(key)
                        : effective ? effective.includes(key) : true;
                      return (
                        <button
                          key={key}
                          onClick={() => toggleModule(key)}
                          disabled={isUpdating}
                          className={cn(
                            "flex items-center justify-between p-2.5 rounded-lg border transition-all text-left",
                            has ? "border-[#1c1c1c]/20 bg-[#1c1c1c]/5" : "border-gray-100 hover:border-gray-200"
                          )}
                        >
                          <span className={cn("text-[11px] font-medium", has ? "text-[#1c1c1c]" : "text-gray-400")}>
                            {NAV_MODULE_LABELS[key] || key}
                          </span>
                          <div className={cn(
                            "w-4 h-4 rounded flex items-center justify-center transition-all flex-shrink-0",
                            has ? "bg-[#1c1c1c] text-white" : "border-2 border-gray-100"
                          )}>
                            {has && <CheckCircle2 className="w-2.5 h-2.5" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Weekly Revenue Target - drives the "Recovered Revenue" progress
              bar on the agent's own dashboard (AgentStats.tsx). Defaults to
              0 with no other way to set it, which made every agent's target
              badge show a meaningless 100%. */}
          {selectedProfile?.role === "agent" && (
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Weekly Revenue Target</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder="e.g. 50000"
                  className="input flex-1 text-xs py-2"
                  value={newRevenueTarget}
                  onChange={e => setNewRevenueTarget(e.target.value)}
                />
                <button
                  onClick={handleUpdateRevenueTarget}
                  disabled={isUpdating}
                  className="btn-secondary whitespace-nowrap"
                >
                  {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Set Target"}
                </button>
              </div>
              <p className="text-[9px] text-gray-400 leading-tight">Weekly recovered-revenue goal shown on this agent&apos;s own dashboard.</p>
            </div>
          )}

          {/* Agent Specialization Section */}
          <div className="space-y-4 pt-4 border-t border-gray-100">
             <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Agent Specialization</label>
             
             <div className="space-y-3">
               <div className="text-[10px] font-medium text-gray-500">Target Customer Segments</div>
               <div className="flex flex-wrap gap-2">
                 {["repeat", "one_time", "inactive", "risky", "whale", "loyalist", "bargain_hunter", "risky_returner"].map(segment => {
                   const isSelected = selectedProfile?.assigned_segments?.includes(segment as any);
                   return (
                     <button 
                       key={segment}
                       onClick={() => toggleSpecialization('segments', segment)}
                       className={cn(
                         "px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border",
                         isSelected 
                           ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" 
                           : "bg-white text-gray-500 border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                       )}
                     >
                       {segment.replace("_", "-").toUpperCase()}
                     </button>
                   );
                 })}
               </div>
               <p className="text-[9px] text-gray-400 italic">If none selected, agent sees all customer segments.</p>
             </div>

             <div className="space-y-3">
               <div className="text-[10px] font-medium text-gray-500">Priority Task Types</div>
               <div className="flex flex-wrap gap-2">
                 {["review", "reorder", "recovery", "issue_resolution", "transit_update", "final_followup", "cod_verify", "ndr", "manager_audit", "welcome_call", "win_back", "vip_followup", "flagged"].map(type => {
                   const isSelected = selectedProfile?.assigned_task_types?.includes(type as any);
                   return (
                     <button 
                       key={type}
                       onClick={() => toggleSpecialization('tasks', type)}
                       className={cn(
                         "px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border",
                         isSelected 
                           ? "bg-indigo-600 text-white border-indigo-600" 
                           : "bg-white text-gray-500 border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                       )}
                     >
                       {type.replace("_", " ").toUpperCase()}
                     </button>
                   );
                 })}
               </div>
               <p className="text-[9px] text-gray-400 italic">If none selected, agent sees all task types.</p>
             </div>

             <div className="space-y-3">
               <div className="text-[10px] font-medium text-gray-500">Field Territory (States)</div>
               <div className="flex flex-wrap gap-2">
                 {INDIAN_STATES.map(state => {
                   const isSelected = selectedProfile?.assigned_states?.includes(state);
                   return (
                     <button
                       key={state}
                       onClick={() => toggleSpecialization('states', state)}
                       className={cn(
                         "px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border",
                         isSelected
                           ? "bg-emerald-600 text-white border-emerald-600"
                           : "bg-white text-gray-500 border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                       )}
                     >
                       {state.toUpperCase()}
                     </button>
                   );
                 })}
               </div>
               <p className="text-[9px] text-gray-400 italic">For on-field reps. If none selected, no state restriction applies.</p>
             </div>
          </div>
          
          <div className="space-y-3 pt-3 border-t border-gray-100">
             <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Security & Access</label>
             <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  placeholder="Type new password to override..." 
                  className="input flex-1 text-xs py-2" 
                  value={newUpdatePassword}
                  onChange={e => setNewUpdatePassword(e.target.value)}
                />
                <button 
                  onClick={handleUpdatePassword} 
                  disabled={isUpdating || newUpdatePassword.length < 6} 
                  className="btn-secondary whitespace-nowrap bg-gray-900 border-gray-900 text-white hover:bg-[#1c1c1c] hover:border-[#1c1c1c] hover:text-white"
                >
                  {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Set Password"}
                </button>
             </div>
             <div className="text-[9px] text-gray-400 leading-tight">
               For security, existing passwords cannot be viewed. Setting a new password will immediately overwrite their current login credentials.
             </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
