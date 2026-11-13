"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Overview = {
  generated_at: string;
  owners: { id: string; email: string; two_factor: boolean; last_sign_in_at: string | null; suspended: boolean }[];
  accounts: { total: number; active: number; suspended: number; two_factor: number; admins: number; admins_two_factor: number; never_signed_in: number };
  sessions: { total: number; aal2: number };
  isolation: { problem: string; table: string; policy: string | null }[];
  rls_off: string[];
  owner_actions: { action: string; count: number }[];
};

const PROBLEM: Record<string, string> = {
  rls_off: "Organisation table with row security off",
  open_policy: "Rule that lets anyone through",
  no_org_check: "Rule that never checks the organisation",
  anon_definer_fn: "Privileged function callable without signing in",
};

function Tile({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={cn("card p-4", warn && "ring-1 ring-amber-300")}>
      <div className="text-[11px] text-[#5f5f5d]">{label}</div>
      <div className={cn("text-xl font-bold tabular-nums mt-1", warn ? "text-amber-700" : "text-[#1c1c1c]")}>{value}</div>
      {sub && <div className="text-[11px] text-[#5f5f5d] mt-1">{sub}</div>}
    </div>
  );
}

function Check({ ok, title, children }: { ok: boolean; title: string; children?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-sm font-bold">
        {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <ShieldAlert className="w-4 h-4 text-red-600" />}
        <span className={ok ? "text-[#1c1c1c]" : "text-red-700"}>{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function SuperAdminSecurity() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("platform_security_overview");
    setBusy(false);
    if (error) return toast.error(error.message);
    setData(data as Overview);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  const a = data.accounts;
  const ownersNo2fa = data.owners.filter(o => !o.two_factor).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Security" subtitle="Live checks on accounts, sessions and tenant isolation. Read-only: nothing here changes data." />
      <div className="flex items-center gap-2 text-[11px] text-[#5f5f5d]">
        Checked {new Date(data.generated_at).toLocaleString()}
        <button onClick={load} disabled={busy} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#eceae4] disabled:opacity-50">
          <RefreshCw className={cn("w-3 h-3", busy && "animate-spin")} /> Run again
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Accounts" value={String(a.total)} sub={`${a.active} active · ${a.suspended} suspended · ${a.never_signed_in} never signed in`} />
        <Tile label="Two-factor on" value={`${a.two_factor} / ${a.total}`} sub="Accounts with a verified authenticator" />
        <Tile label="Org admins with two-factor" value={`${a.admins_two_factor} / ${a.admins}`} warn={a.admins_two_factor < a.admins}
          sub="Admins can change roles and settings for their whole organisation" />
        <Tile label="Live sessions" value={String(data.sessions.total)} sub={`Used in the last 7 days · ${data.sessions.aal2} with two-factor`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Check ok={data.isolation.length === 0} title={data.isolation.length === 0 ? "Tenant isolation: all 4 checks pass" : `Tenant isolation: ${data.isolation.length} problem(s)`}>
          <p className="text-[11px] text-[#5f5f5d] mt-1">Row security on every organisation table, no open rules, every rule checks the organisation, no privileged function open to signed-out visitors.</p>
          {data.isolation.map((p, i) => (
            <div key={i} className="text-xs mt-2"><b>{PROBLEM[p.problem] || p.problem}</b>: <span className="font-mono">{p.table}{p.policy ? ` · ${p.policy}` : ""}</span></div>
          ))}
        </Check>
        <Check ok={data.rls_off.length === 0} title={data.rls_off.length === 0 ? "Row security on for every table" : `${data.rls_off.length} table(s) without row security`}>
          {data.rls_off.length > 0 && <p className="text-xs font-mono mt-2 break-words">{data.rls_off.join(", ")}</p>}
        </Check>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <div className={cn("card p-4", ownersNo2fa > 0 && "ring-1 ring-red-300")}>
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-2">Owner accounts</div>
          {data.owners.map(o => (
            <div key={o.id} className="flex flex-wrap items-center gap-2 text-xs py-1">
              <span className="flex-1 min-w-0 truncate">{o.email}</span>
              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", o.two_factor ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>{o.two_factor ? "Two-factor on" : "No two-factor"}</span>
              <span className="text-[#5f5f5d]">{o.last_sign_in_at ? `Signed in ${new Date(o.last_sign_in_at).toLocaleDateString()}` : "Never signed in"}</span>
            </div>
          ))}
        </div>
        <div className="card p-4">
          <div className="flex items-center mb-2">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d] flex-1">Owner actions, last 7 days</div>
            <Link href="/superadmin/activity" className="text-[11px] underline text-[#5f5f5d]">All activity</Link>
          </div>
          {data.owner_actions.length === 0 ? <p className="text-xs text-[#5f5f5d]">None.</p> : data.owner_actions.map(x => (
            <div key={x.action} className="flex justify-between text-xs py-0.5"><span className="font-mono">{x.action}</span><span className="tabular-nums">{x.count}</span></div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-[#5f5f5d]">To block an account or end its sessions, use <Link href="/superadmin/users" className="underline">Users</Link>. Failed sign-in attempts aren&apos;t shown: the sign-in service doesn&apos;t record them.</p>
    </div>
  );
}
