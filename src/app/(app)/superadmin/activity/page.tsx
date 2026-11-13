"use client";
import { useEffect, useMemo, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase";

type AuditRow = {
  id: string; action: string; target_type: string | null; target_id: string | null;
  details: { changed?: Record<string, { from: unknown; to: unknown }>; [k: string]: unknown } | null; created_at: string;
};

const describe = (a: AuditRow) => {
  const changed = a.details?.changed;
  if (changed) return Object.entries(changed).map(([k, c]) => `${k.replace(/_/g, " ")}: ${JSON.stringify(c.from)} to ${JSON.stringify(c.to)}`).join(", ");
  const { name, slug } = (a.details || {}) as { name?: string; slug?: string };
  return [name, slug].filter(Boolean).join(" · ") || Object.entries(a.details || {}).filter(([, v]) => v != null).map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ");
};

export default function SuperAdminActivity() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("platform_audit_logs").select("*").order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => { setRows((data || []) as AuditRow[]); setLoading(false); });
  }, [supabase]);

  return (
    <div>
      <PageHeader title="Owner activity" subtitle="Every owner action, newest first. Permanent: nobody can edit or delete it." />
      {loading ? (
        <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<History className="w-6 h-6" />} title="No owner actions yet" desc="Suspensions, reactivations, request updates and new organisations appear here." />
      ) : (
        <div className="card divide-y divide-gray-50">
          {rows.map(a => (
            <div key={a.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs">
              <span className="text-gray-500 sm:w-44 shrink-0">{new Date(a.created_at).toLocaleString()}</span>
              <span className="font-bold text-[#1c1c1c] sm:w-48 shrink-0">{a.action.replace(/_/g, " ").replace(".", ": ")}</span>
              <span className="text-gray-600 break-words">{describe(a)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
