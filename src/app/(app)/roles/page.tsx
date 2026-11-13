"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Shield, Eye, Trash2, UserPlus, ShoppingBag, Users, MessageSquare,
  CheckCircle2, Plus, Loader2, Edit2, Lock,
} from "lucide-react";
import { PageHeader, Modal, EmptyState, AccessDenied } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import type { Role, UserPermissions } from "@/types";
import { NAV_MODULE_GROUPS, ALL_NAV_MODULES, NEUTRAL_NAV_MODULES, hasPermission } from "@/lib/permissions";
import { isDemoMode } from "@/lib/demo";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { HOME_WIDGETS } from "@/components/workspace/WorkspaceHome";
import { PERMISSION_MODULES, SCOPES, SCOPE_LABELS, type Action, type Grants, type Scope } from "@/lib/access";

const NAV_MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard", tasks: "Tasks", chat: "Chat", "my-hub": "My Hub",
  customers: "Customers", orders: "Orders", calendar: "Calendar",
  performance: "Performance", "request-creative": "Request Creative",
  floor: "Live Floor", reports: "Analytics", "abandoned-carts": "Abandoned Carts",
  "admin-logs": "Alert Logs", recordings: "Recordings", import: "Import",
  campaigns: "Campaigns", templates: "Templates", workflows: "Workflows",
  "system-health": "System Health", settings: "Settings",
  team: "Team", hr: "HR", manager: "Manager Hub", roles: "Roles", organisation: "Organisation",
};

// Same 10 flags Team page's Access Control modal exposes — kept identical
// so a role's permissions and a profile's per-user override mean the same
// thing everywhere.
const PERMISSION_FIELDS: { key: keyof UserPermissions; label: string; icon: any }[] = [
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
];

const EMPTY_PERMISSIONS: UserPermissions = {
  view_analytics: false, can_import: false, can_delete: false, manage_team: false,
  manage_orders: false, manage_customers: false, send_whatsapp: false,
  audit_tasks: false, manage_automations: false, manage_workspaces: false,
};

// grants === null: this database has no roles.grants column yet (pre-20261111c), so the matrix is hidden and not saved.
type RoleForm = { name: string; permissions: UserPermissions; nav_modules: string[] | null; grants: Grants | null; home_widgets: string[] | null };

export default function RolesPage() {
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [form, setForm] = useState<RoleForm>({ name: "", permissions: EMPTY_PERMISSIONS, nav_modules: null, grants: null, home_widgets: null });
  const [saving, setSaving] = useState(false);

  const { profile: currentProfile, loading: profileLoading } = useCurrentProfile();
  const supabase = createClient();

  const fetchRoles = useCallback(async () => {
    if (isDemoMode()) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("roles").select("*").order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    else setRoles((data || []) as Role[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  function openCreate() {
    setEditingRole(null);
    // A new role starts with the neutral menu, not every page: the admin ticks what the job needs.
    setForm({ name: "", permissions: { ...EMPTY_PERMISSIONS }, nav_modules: [...NEUTRAL_NAV_MODULES], grants: roles.some(r => r.grants !== undefined) ? {} : null, home_widgets: null });
    setModalOpen(true);
  }

  function openEdit(role: Role) {
    setEditingRole(role);
    setForm({ name: role.name, permissions: { ...EMPTY_PERMISSIONS, ...role.permissions }, nav_modules: role.nav_modules, grants: role.grants ?? null, home_widgets: role.home_widgets ?? null });
    setModalOpen(true);
  }

  function togglePermission(key: keyof UserPermissions) {
    setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: !f.permissions[key] } }));
  }

  function toggleModule(key: string) {
    setForm(f => {
      const cur = f.nav_modules ?? [...ALL_NAV_MODULES];
      const next = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key];
      return { ...f, nav_modules: next };
    });
  }

  function setGrant(module: string, action: Action, scope: Scope | "") {
    setForm(f => {
      const { [action]: _removed, ...rest } = f.grants?.[module] ?? {};
      return { ...f, grants: { ...f.grants, [module]: scope ? { ...rest, [action]: scope } : rest } };
    });
  }

  function resetModules() {
    setForm(f => ({ ...f, nav_modules: null }));
  }

  async function handleDelete(role: Role) {
    if (role.is_system) return;
    if (!confirm(`Delete the "${role.name}" role? Anyone currently assigned it keeps the name but loses its permissions until reassigned.`)) return;
    const { error } = await supabase.from("roles").delete().eq("id", role.id);
    if (error) toast.error(error.message);
    else { toast.success("Role deleted"); fetchRoles(); }
  }

  async function handleSave() {
    const name = form.name.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name) return toast.error("Role name is required");

    setSaving(true);
    // A new role saved with an empty matrix gets its grants derived from the flags by the DB trigger.
    const payload = { name, permissions: form.permissions, nav_modules: form.nav_modules, ...(form.grants ? { grants: form.grants, home_widgets: form.home_widgets } : {}) };

    const { error } = editingRole
      ? await supabase.from("roles").update(payload).eq("id", editingRole.id)
      : await supabase.from("roles").insert(payload);

    if (error) {
      toast.error(error.message.includes("duplicate") ? `A role named "${name}" already exists.` : error.message);
    } else {
      toast.success(editingRole ? "Role updated" : "Role created");
      setModalOpen(false);
      fetchRoles();
    }
    setSaving(false);
  }

  if (profileLoading || loading) {
    return <div className="py-12 text-center text-gray-400">Loading roles...</div>;
  }

  if (!hasPermission(currentProfile, "manage_team")) {
    return <AccessDenied title="Roles Locked" desc="Only admins or users with team-management access can manage roles." />;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Roles"
        subtitle="Define roles and the permissions/pages each one grants. Assign them to people on the Team page."
        actions={
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Role
          </button>
        }
      />

      {roles.length === 0 ? (
        <EmptyState icon={<Shield className="w-6 h-6" />} title="No roles yet" desc="Create your first role to get started." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map(role => {
            const grantedCount = PERMISSION_FIELDS.filter(f => role.permissions?.[f.key]).length;
            return (
              <div key={role.id} className="card p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-[#1c1c1c] capitalize">{role.name.replace(/_/g, " ")}</span>
                      {role.is_system && <Lock className="w-3 h-3 text-gray-300" />}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {role.name === "admin" ? "All permissions by default" : `${grantedCount} of ${PERMISSION_FIELDS.length} permissions`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => openEdit(role)} className="btn-secondary flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5">
                    <Edit2 className="w-3 h-3" /> Edit
                  </button>
                  {!role.is_system && (
                    <button aria-label="Delete" onClick={() => handleDelete(role)} className="btn-secondary text-xs py-1.5 px-2.5 text-rose-500 hover:bg-rose-50">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRole ? `Edit "${editingRole.name}"` : "New Role"}
        footer={
          <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-2.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save Role"}
          </button>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Role Name</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Web Developer"
              value={form.name}
              disabled={!!editingRole?.is_system}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
            {editingRole?.is_system && (
              <p className="text-[9px] text-gray-400 mt-1">System role names can&apos;t be renamed.</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Permissions</label>
            {PERMISSION_FIELDS.map(perm => {
              const has = form.permissions[perm.key];
              return (
                <button
                  key={perm.key}
                  onClick={() => togglePermission(perm.key)}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left",
                    has ? "border-[#1c1c1c]/20 bg-[#1c1c1c]/5" : "border-gray-100 hover:border-gray-200"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <perm.icon className={`w-3.5 h-3.5 ${has ? "text-[#1c1c1c]" : "text-gray-300"}`} />
                    <span className={`text-xs font-medium ${has ? "text-[#1c1c1c]" : "text-gray-500"}`}>{perm.label}</span>
                  </div>
                  <div className={cn(
                    "w-5 h-5 rounded flex items-center justify-center transition-all",
                    has ? "bg-[#1c1c1c] text-white" : "border-2 border-gray-100"
                  )}>
                    {has && <CheckCircle2 className="w-3 h-3" />}
                  </div>
                </button>
              );
            })}
          </div>

          {form.grants && editingRole?.name !== "admin" && (
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Access Matrix</label>
              <p className="text-[9px] text-gray-400 leading-tight">
                What this role can do in each module, and how far it reaches: own records, their reporting team, their department, their branch, or everyone.
              </p>
              {Array.from(new Set(PERMISSION_MODULES.map(m => m.group))).map(group => (
                <div key={group} className="space-y-1.5">
                  <div className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{group}</div>
                  {PERMISSION_MODULES.filter(m => m.group === group).map(mod => (
                    <div key={mod.key} className="p-2.5 rounded-lg border border-gray-100">
                      <div className="text-[11px] font-semibold text-[#1c1c1c] mb-1.5">{mod.label}</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {mod.actions.map(action => (
                          <label key={action} className="flex items-center justify-between gap-1.5 text-[10px] text-gray-500 capitalize">
                            {action}
                            <select
                              value={form.grants?.[mod.key]?.[action] ?? ""}
                              onChange={e => setGrant(mod.key, action, e.target.value as Scope | "")}
                              className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white text-[#1c1c1c] normal-case"
                            >
                              <option value="">No</option>
                              {SCOPES.map(s => <option key={s} value={s}>{SCOPE_LABELS[s]}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {form.grants && (
            <div className="space-y-2 pt-4 border-t border-gray-100">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Home Screen</label>
              <p className="text-[9px] text-gray-400 leading-tight">Widgets this role lands on. All checked = everything it has access to.</p>
              <div className="grid grid-cols-2 gap-2">
                {HOME_WIDGETS.map(w => {
                  const on = form.home_widgets === null || form.home_widgets.includes(w.key);
                  return (
                    <label key={w.key} className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-100 text-[11px] text-[#1c1c1c] cursor-pointer">
                      <input type="checkbox" checked={on} onChange={() => setForm(f => {
                        const cur = f.home_widgets ?? HOME_WIDGETS.map(x => x.key);
                        const next = on ? cur.filter(k => k !== w.key) : [...cur, w.key];
                        return { ...f, home_widgets: next.length === HOME_WIDGETS.length ? null : next };
                      })} />
                      {w.label}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-3 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Module Access</label>
              {form.nav_modules !== null && (
                <button onClick={resetModules} className="text-[9px] font-black text-rose-500 uppercase tracking-widest hover:underline">
                  Reset to all
                </button>
              )}
            </div>
            <p className="text-[9px] text-gray-400 leading-tight">
              {form.nav_modules === null
                ? "All pages visible (default). Uncheck any to restrict anyone with this role to a subset."
                : "Only the checked pages show in the sidebar for anyone with this role."}
            </p>
            {Object.entries(NAV_MODULE_GROUPS).map(([group, keys]) => (
              <div key={group} className="space-y-1.5">
                <div className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{group}</div>
                <div className="grid grid-cols-2 gap-2">
                  {keys.map(key => {
                    const has = form.nav_modules === null ? true : form.nav_modules.includes(key);
                    return (
                      <button
                        key={key}
                        onClick={() => toggleModule(key)}
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
        </div>
      </Modal>
    </div>
  );
}
