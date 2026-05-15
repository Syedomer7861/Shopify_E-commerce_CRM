"use client";
import { useEffect, useState, useCallback } from "react";
import { Shield, User, Loader2, Mail, Trash2, Edit2, UserPlus, CheckCircle2, XCircle, ShoppingBag, Users, MessageSquare, Eye, Search, Filter } from "lucide-react";
import { PageHeader, Avatar, EmptyState, Modal } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import type { Profile, UserPermissions } from "@/types";
import { AccessDenied } from "@/components/ui";
import { DEFAULT_PERMISSIONS, DEFAULT_HR_PERMISSIONS, DEFAULT_MANAGER_PERMISSIONS, hasPermission } from "@/lib/permissions";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { logAuditEvent } from "@/lib/audit";

import { createTeamMemberServer, updateTeamMemberPasswordServer, deleteTeamMemberServer } from "@/app/actions/admin";

export default function TeamPage() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [editModal, setEditModal] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // New user state
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // New user state
  const [newUser, setNewUser] = useState({ email: "", password: "", name: "", role: "agent" as "agent" | "admin" | "hr" | "manager" });
  const { profile: currentProfile, loading: profileLoading } = useCurrentProfile();

  const supabase = createClient();

  const fetchProfiles = useCallback(async () => {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setLoading(true);
      const { MOCK_TEAM } = await import("@/lib/mockData");
      setProfiles(MOCK_TEAM as Profile[]);
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

  useEffect(() => {
    if (!profileLoading) {
      fetchProfiles();
    }
  }, [profileLoading, currentProfile?.id, fetchProfiles]);

  async function handleAddMember() {
    if (!newUser.email || !newUser.password) return toast.error("Email and Password are required");
    if (newUser.password.length < 6) return toast.error("Password must be at least 6 characters");
    
    setIsUpdating(true);
    
    const res = await createTeamMemberServer({
      email: newUser.email,
      password: newUser.password,
      name: newUser.name,
      role: newUser.role,
      permissions: newUser.role === "admin" ? {
        view_analytics: true,
        can_import: true,
        can_delete: true,
        manage_team: true,
        manage_orders: true,
        manage_customers: true,
        send_whatsapp: true,
        audit_tasks: true,
        manage_automations: true,
      } : newUser.role === "manager" ? {
        view_analytics: true,
        can_import: true,
        can_delete: false,
        manage_team: true,
        manage_orders: true,
        manage_customers: true,
        send_whatsapp: true,
        audit_tasks: true,
        manage_automations: false,
      } : DEFAULT_PERMISSIONS,
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

  async function updateProfile(updates: Partial<Profile>) {
    if (!selectedProfile) return;
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
    const current = selectedProfile.permissions || DEFAULT_PERMISSIONS;
    const updated = { ...current, [key]: !current[key] };
    updateProfile({ permissions: updated });
  };

  const toggleSpecialization = (type: 'segments' | 'tasks', value: string) => {
    if (!selectedProfile) return;
    const field = type === 'segments' ? 'assigned_segments' : 'assigned_task_types';
    const current = (selectedProfile[field] || []) as string[];
    const updated = current.includes(value) 
      ? current.filter(v => v !== value) 
      : [...current, value];
    
    updateProfile({ [field]: updated.length === 0 ? null : updated });
  };

  const [newUpdatePassword, setNewUpdatePassword] = useState("");

  async function handleUpdatePassword() {
    if (!selectedProfile) return;
    if (newUpdatePassword.length < 6) return toast.error("Password must be at least 6 characters");
    
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
        subtitle={`${profiles.filter(p => p.is_active).length} active members`}
        actions={
          <button onClick={() => setAddModal(true)} className="btn-primary gap-2">
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
        <div className="flex p-1 bg-gray-100 rounded-xl w-fit">
          {["all", "admin", "manager", "hr", "agent"].map(role => (
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
              {role}
            </button>
          ))}
        </div>
      </div>

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
              const matchesRole = roleFilter === "all" || p.role === roleFilter;
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
                <div className="relative">
                  <Avatar name={p.name || p.email} size="md" />
                  <div className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white", dotColor, isOnline && "animate-pulse")} />
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border",
                    p.role === 'admin' && "bg-zinc-900 text-white border-zinc-900",
                    p.role === 'manager' && "bg-violet-50 text-violet-700 border-violet-100",
                    p.role === 'hr' && "bg-rose-50 text-rose-700 border-rose-100",
                    p.role === 'agent' && "bg-emerald-50 text-emerald-700 border-emerald-100"
                  )}>
                    {p.role === 'hr' ? 'HR' : p.role}
                  </div>
                  <button onClick={() => handleRemoveMember(p.id)} className="p-1.5 text-gray-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100">
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
                  onClick={() => { setSelectedProfile(p); setNewUpdatePassword(""); setEditModal(true); }}
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
            <input type="email" className="input" placeholder="agent@cureforever.in" 
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
            <select className="select" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value as any })}>
              <option value="agent">Sales Agent</option>
              <option value="hr">HR (Staffing)</option>
              <option value="manager">Manager (Operations)</option>
              <option value="admin">Administrator</option>
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
               <button 
                 onClick={() => updateProfile({ role: "agent", permissions: DEFAULT_PERMISSIONS })}
                 className={`p-3 rounded-lg border text-left transition-all ${selectedProfile?.role === 'agent' ? 'border-[#1c1c1c] bg-[#1c1c1c]/5' : 'border-gray-100 hover:border-gray-200'}`}
               >
                 <div className={`text-xs font-bold ${selectedProfile?.role === 'agent' ? 'text-[#1c1c1c]' : 'text-gray-600'}`}>Agent</div>
                 <div className="text-[9px] text-gray-400 mt-0.5">Sales Only</div>
               </button>
               <button 
                 onClick={() => updateProfile({ role: "hr", permissions: DEFAULT_HR_PERMISSIONS })}
                 className={`p-3 rounded-lg border text-left transition-all ${selectedProfile?.role === 'hr' ? 'border-[#1c1c1c] bg-[#1c1c1c]/5' : 'border-gray-100 hover:border-gray-200'}`}
               >
                 <div className={`text-xs font-bold ${selectedProfile?.role === 'hr' ? 'text-[#1c1c1c]' : 'text-gray-600'}`}>HR</div>
                 <div className="text-[9px] text-gray-400 mt-0.5">Staffing</div>
               </button>
               <button 
                 onClick={() => updateProfile({ role: "manager", permissions: DEFAULT_MANAGER_PERMISSIONS })}
                 className={`p-3 rounded-lg border text-left transition-all ${selectedProfile?.role === 'manager' ? 'border-[#1c1c1c] bg-[#1c1c1c]/5' : 'border-gray-100 hover:border-gray-200'}`}
               >
                 <div className={`text-xs font-bold ${selectedProfile?.role === 'manager' ? 'text-[#1c1c1c]' : 'text-gray-600'}`}>Manager</div>
                 <div className="text-[9px] text-gray-400 mt-0.5">Operations</div>
               </button>
               <button 
                 onClick={() => updateProfile({ role: "admin" })}
                 className={`p-3 rounded-lg border text-left transition-all ${selectedProfile?.role === 'admin' ? 'border-[#1c1c1c] bg-[#1c1c1c]/5' : 'border-gray-100 hover:border-gray-200'}`}
               >
                 <div className={`text-xs font-bold ${selectedProfile?.role === 'admin' ? 'text-[#1c1c1c]' : 'text-gray-600'}`}>Admin</div>
                 <div className="text-[9px] text-gray-400 mt-0.5">Full System</div>
               </button>
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
                ].map((perm) => {
                  const isAdmin = selectedProfile?.role === "admin";
                  const has = isAdmin || (selectedProfile?.permissions as any)?.[perm.key];
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

          {/* Agent Specialization Section */}
          <div className="space-y-4 pt-4 border-t border-gray-100">
             <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Agent Specialization</label>
             
             <div className="space-y-3">
               <div className="text-[10px] font-medium text-gray-500">Target Customer Segments</div>
               <div className="flex flex-wrap gap-2">
                 {["repeat", "one_time", "inactive", "risky"].map(segment => {
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
                 {["review", "reorder", "recovery", "issue_resolution", "transit_update", "final_followup"].map(type => {
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
