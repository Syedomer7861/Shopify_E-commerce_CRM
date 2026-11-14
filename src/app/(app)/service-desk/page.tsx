"use client";
import toast from "react-hot-toast";
import { ModulePage } from "@/components/records/ModulePage";
import { ServiceDeskOverview } from "@/components/records/DeptOverviews";
import type { RecordsConfig, RecordRow } from "@/components/records/RecordsModule";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { can } from "@/lib/access";

function sla(due: string | null, row: RecordRow) {
  if (!due) return "—";
  if (row.status === "resolved" || row.status === "closed") return <span className="text-gray-400">Done</span>;
  const hours = Math.round((new Date(due).getTime() - Date.now()) / 3600000);
  return hours < 0
    ? <span className="font-bold text-rose-600">{-hours}h over</span>
    : <span className={hours <= 2 ? "font-bold text-amber-600" : "text-gray-600"}>{hours}h left</span>;
}

export default function ServiceDeskPage() {
  const { profile } = useCurrentProfile();
  const canAssign = can(profile, "tickets", "assign") !== null;

  async function take(row: RecordRow, reload: () => void) {
    const { error } = await createClient().from("tickets").update({ assignee_id: profile?.id, status: "in_progress" }).eq("id", row.id);
    if (error) toast.error(error.message);
    else reload();
  }

  const tickets: RecordsConfig = {
    table: "tickets", module: "tickets", noun: "ticket", ownerCol: "requester_id", ownerLabel: "Raised by",
    columns: [
      { key: "subject", label: "Subject" },
      { key: "category", label: "Category" },
      { key: "priority", label: "Priority", format: v => <span className="capitalize">{v}</span> },
      { key: "sla_due_at", label: "SLA", format: sla },
    ],
    statuses: ["open", "in_progress", "waiting", "resolved", "closed"],
    fields: [
      { key: "subject", label: "What do you need?", required: true },
      { key: "category", label: "Category", type: "select", options: ["IT", "HR", "Finance", "Facilities", "Other"] },
      { key: "priority", label: "Priority", type: "select", options: ["low", "normal", "high", "urgent"] },
      { key: "description", label: "Details", type: "textarea" },
    ],
    rowActions: (row, reload) =>
      row.assignee_id === profile?.id ? <span className="text-[10px] font-bold text-emerald-600">Yours</span>
      : canAssign && !row.assignee_id ? <button onClick={() => take(row, reload)} className="text-[10px] font-bold underline text-[#1c1c1c]">Take</button>
      : null,
  };

  return (
    <ModulePage
      title="Service Desk"
      subtitle="Raise a request to IT, HR, Finance or Facilities. Urgent 4h, high 8h, normal 24h, low 72h."
      overview={<ServiceDeskOverview />}
      tabs={[{ label: "Tickets", config: tickets }]}
    />
  );
}
