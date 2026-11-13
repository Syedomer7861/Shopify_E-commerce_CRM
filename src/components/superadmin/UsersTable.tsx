"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, LogOut, Ban, CheckCircle2, ShieldCheck, Users } from "lucide-react";
import toast from "react-hot-toast";
import { EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export type PlatformUser = {
  user_id: string; email: string | null; name: string | null; role: string | null;
  org_id: string | null; org_name: string | null; is_active: boolean; is_platform_admin: boolean;
  suspended: boolean; two_factor: boolean; last_seen_at: string | null; last_sign_in_at: string | null; created_at: string;
};

export const ago = (iso: string | null) => {
  if (!iso) return "Never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`;
};

/** Every account (or one organisation's). Actions run as database functions that check owner + two-factor themselves. */
export function UsersTable({ orgId, showOrg = true }: { orgId?: string; showOrg?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("platform_user_directory", { p_org: orgId ?? null });
    if (error) toast.error(error.message);
    else setUsers((data || []) as PlatformUser[]);
    setLoading(false);
  }, [supabase, orgId]);

  useEffect(() => { load(); }, [load]);

  async function run(u: PlatformUser, action: "suspend" | "reactivate" | "signout") {
    const who = u.email || u.name || "this user";
    const prompt = action === "suspend" ? `Suspend ${who}? They are signed out everywhere and cannot sign in until reactivated.`
      : action === "reactivate" ? `Let ${who} sign in again?` : `Sign ${who} out on every device?`;
    if (!window.confirm(prompt)) return;
    setBusyId(u.user_id);
    const { data, error } = action === "signout"
      ? await supabase.rpc("platform_force_sign_out", { p_user: u.user_id })
      : await supabase.rpc("platform_set_user_suspended", { p_user: u.user_id, p_suspend: action === "suspend" });
    if (error) toast.error(error.message);
    else {
      toast.success(action === "signout" ? `Ended ${data ?? 0} session(s)` : action === "suspend" ? "User suspended" : "User reactivated");
      if (action !== "signout") setUsers(prev => prev.map(x => (x.user_id === u.user_id ? { ...x, suspended: action === "suspend" } : x)));
    }
    setBusyId(null);
  }

  const term = q.trim().toLowerCase();
  const shown = term ? users.filter(u => [u.email, u.name, u.org_name, u.role].some(v => v?.toLowerCase().includes(term))) : users;

  if (loading) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  return (
    <div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by name, email, organisation or role..."
        className="w-full h-10 px-3 mb-4 bg-white border border-[#eceae4] rounded-xl text-sm focus:outline-none focus:border-[#1c1c1c]/30" />
      {shown.length === 0 ? (
        <EmptyState icon={<Users className="w-6 h-6" />} title="No users here" desc="Nothing matched." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-[#5f5f5d] border-b border-[#eceae4]">
                <th className="p-3">User</th>
                {showOrg && <th className="p-3">Organisation</th>}
                <th className="p-3">Role</th>
                <th className="p-3">Last active</th>
                <th className="p-3">Last sign-in</th>
                <th className="p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {shown.map(u => (
                <tr key={u.user_id} className="border-b border-gray-50 last:border-0">
                  <td className="p-3">
                    <div className="font-semibold text-[#1c1c1c] flex items-center gap-1.5">
                      {u.name || "—"}
                      {u.two_factor && <span title="Two-factor on"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /></span>}
                    </div>
                    <div className="text-[11px] text-[#5f5f5d]">{u.email}</div>
                  </td>
                  {showOrg && (
                    <td className="p-3 text-xs">
                      {u.org_id ? <Link href={`/superadmin/organisations/${u.org_id}`} className="text-[#1c1c1c] hover:underline">{u.org_name}</Link> : "—"}
                    </td>
                  )}
                  <td className="p-3 text-xs text-[#5f5f5d] capitalize">{u.is_platform_admin ? "Owner" : u.role || "—"}</td>
                  <td className="p-3 text-xs text-[#5f5f5d]">{ago(u.last_seen_at)}</td>
                  <td className="p-3 text-xs text-[#5f5f5d]">{ago(u.last_sign_in_at)}</td>
                  <td className="p-3">
                    <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                      u.suspended ? "bg-rose-50 text-rose-600" : !u.is_active ? "bg-gray-100 text-gray-600" : "bg-emerald-50 text-emerald-700")}>
                      {u.suspended ? "Suspended" : !u.is_active ? "Off in team" : "Active"}
                    </span>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {u.is_platform_admin ? null : busyId === u.user_id ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (
                      <div className="inline-flex gap-1.5">
                        <button onClick={() => run(u, "signout")} title="Sign out everywhere"
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-[#eceae4] text-[#5f5f5d] hover:bg-[#f7f4ed]">
                          <LogOut className="w-3 h-3" /> Sign out
                        </button>
                        {u.suspended ? (
                          <button onClick={() => run(u, "reactivate")}
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-emerald-100 text-emerald-700 hover:bg-emerald-50">
                            <CheckCircle2 className="w-3 h-3" /> Reactivate
                          </button>
                        ) : (
                          <button onClick={() => run(u, "suspend")}
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-rose-100 text-rose-600 hover:bg-rose-50">
                            <Ban className="w-3 h-3" /> Suspend
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
