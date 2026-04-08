"use client";
import { useEffect, useState } from "react";
import { Shield, User, Loader2, Mail, Trash2, Edit2, UserPlus, CheckCircle2, XCircle } from "lucide-react";
import { PageHeader, Avatar, EmptyState, Modal } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import toast from "react-hot-toast";
import type { Profile, UserPermissions } from "@/types";

import { createTeamMemberServer } from "@/app/actions/admin";

const DEFAULT_PERMISSIONS: UserPermissions = {
  view_analytics: false,
  can_import: false,
  can_delete: false,
  manage_team: false,
};

export default function TeamPage() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [editModal, setEditModal] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // New user state
  const [newUser, setNewUser] = useState({ email: "", password: "", name: "", role: "agent" as "agent" | "admin" });

  const supabase = createClient();

  useEffect(() => {
    fetchProfiles();
  }, []);

  async function fetchProfiles() {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      toast.error(error.message);
    } else {
      setProfiles(data || []);
    }
    setLoading(false);
  }

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
      } : DEFAULT_PERMISSIONS,
    });

    if (!res.success) {
      toast.error(res.error || "Failed to create user");
    } else {
      toast.success("Team member created successfully!");
      fetchProfiles();
      setAddModal(false);
      setNewUser({ email: "", password: "", name: "", role: "agent" });
    }
    setIsUpdating(false);
  }

  async function handleRemoveMember(id: string) {
    if (!confirm("Are you sure you want to remove this team member? This action cannot be undone.")) return;
    
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Member removed");
      fetchProfiles();
    }
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
          profiles.map(p => (
            <div key={p.id} className={`card p-4 hover:shadow-md transition-all group border-l-4 ${p.is_active ? 'border-l-transparent hover:border-l-forest' : 'border-l-gray-200 opacity-60'}`}>
               <div className="flex items-center justify-between mb-3">
                <Avatar name={p.name || p.email} size="md" />
                <div className="flex items-center gap-2">
                  <div className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${p.role === 'admin' ? 'bg-forest text-lime' : 'bg-gray-100 text-gray-500'}`}>
                    {p.role}
                  </div>
                  <button onClick={() => handleRemoveMember(p.id)} className="p-1.5 text-gray-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="mb-4">
                <div className="text-sm font-semibold text-forest truncate flex items-center gap-2">
                  {p.name || "Pending Signup"}
                  {!p.is_active && <XCircle className="w-3 h-3 text-rose-500" />}
                </div>
                <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                  <Mail className="w-3 h-3" /> {p.email}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-3 border-t border-gray-50">
                <button 
                  onClick={() => { setSelectedProfile(p); setEditModal(true); }}
                  className="flex-1 btn-secondary py-1.5 text-xs gap-1.5"
                >
                  <Edit2 className="w-3 h-3" /> Edit Permissions
                </button>
              </div>
            </div>
          ))
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
                  <div className="text-xs font-bold text-forest">{selectedProfile?.name || "Pending User"}</div>
                  <div className="text-[10px] text-gray-400">{selectedProfile?.email}</div>
               </div>
             </div>
             <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-gray-400">{selectedProfile?.is_active ? "Active" : "Disabled"}</span>
                <button 
                  onClick={() => updateProfile({ is_active: !selectedProfile?.is_active })}
                  disabled={isUpdating}
                  className={`w-8 h-4 rounded-full relative transition-colors ${selectedProfile?.is_active ? 'bg-forest' : 'bg-gray-200'}`}
                >
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${selectedProfile?.is_active ? 'left-4.5' : 'left-0.5'}`} />
                </button>
             </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Security Role</label>
            <div className="grid grid-cols-2 gap-2">
               <button 
                 onClick={() => updateProfile({ role: "agent" })}
                 className={`p-3 rounded-lg border text-left transition-all ${selectedProfile?.role === 'agent' ? 'border-forest bg-forest/5' : 'border-gray-100 hover:border-gray-200'}`}
               >
                 <div className={`text-xs font-bold ${selectedProfile?.role === 'agent' ? 'text-forest' : 'text-gray-600'}`}>Agent</div>
                 <div className="text-[9px] text-gray-400 mt-0.5">Restricted rights</div>
               </button>
               <button 
                 onClick={() => updateProfile({ role: "admin" })}
                 className={`p-3 rounded-lg border text-left transition-all ${selectedProfile?.role === 'admin' ? 'border-forest bg-forest/5' : 'border-gray-100 hover:border-gray-200'}`}
               >
                 <div className={`text-xs font-bold ${selectedProfile?.role === 'admin' ? 'text-forest' : 'text-gray-600'}`}>Admin</div>
                 <div className="text-[9px] text-gray-400 mt-0.5">Full access</div>
               </button>
            </div>
          </div>
          
          <div className="space-y-3">
             <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Specific Permissions</label>
             <div className="space-y-2">
                {[
                  { key: "view_analytics", label: "View Reports & Analytics", icon: Shield },
                  { key: "can_import", label: "Import & Export Data", icon: Shield },
                  { key: "can_delete", label: "Delete Records (Customers/Orders)", icon: Trash2 },
                  { key: "manage_team", label: "Manage Team & Roles", icon: UserPlus },
                ].map((perm) => {
                  const has = selectedProfile?.role === "admin" || (selectedProfile?.permissions as any)?.[perm.key];
                  return (
                    <div key={perm.key} className={`flex items-center justify-between p-3 rounded-lg border ${has ? 'border-forest/20 bg-forest/5' : 'border-gray-100'}`}>
                      <div className="flex items-center gap-3">
                        <perm.icon className={`w-3.5 h-3.5 ${has ? 'text-forest' : 'text-gray-300'}`} />
                        <span className={`text-xs font-medium ${has ? 'text-forest' : 'text-gray-500'}`}>{perm.label}</span>
                      </div>
                      <button 
                        onClick={() => togglePermission(perm.key as any)}
                        disabled={selectedProfile?.role === "admin" || isUpdating}
                        className={`w-5 h-5 rounded flex items-center justify-center transition-all ${has ? 'bg-forest text-white' : 'border-2 border-gray-100'}`}
                      >
                        {has && <CheckCircle2 className="w-3 h-3" />}
                      </button>
                    </div>
                  );
                })}
             </div>
             {selectedProfile?.role === "admin" && (
               <p className="text-[9px] text-gray-400 italic text-center">Administrators have all permissions by default.</p>
             )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
