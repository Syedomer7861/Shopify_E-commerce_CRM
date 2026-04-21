"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import toast from "react-hot-toast";

export function AdminNotifier() {
  const { profile, loading } = useCurrentProfile();
  const supabase = createClient();

  useEffect(() => {
    if (loading || !profile) return;
    if (profile.role !== "admin") return;

    // High-priority actions that deserve a notification
    const WHITELIST = [
      "manual_customer_create",
      "bulk_delete",
      "system_configuration_change",
      "manual_task_assignment"
    ];

    let lastToastTime = 0;

    const auditChannel = supabase
      .channel("admin-notifier-audit")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs" },
        (payload: any) => {
          const action = payload.new.action;
          const details = payload.new.summary;

          if (!WHITELIST.includes(action)) return;

          // Anti-spam: Ignore if same action happened within 3s (prevents bulk action noise)
          const now = Date.now();
          if (now - lastToastTime < 3000) return;
          lastToastTime = now;

          toast(
            <div className="flex flex-col gap-1">
              <span className="font-bold text-sm text-[#4CAF50]">{action.replace(/_/g, ' ').toUpperCase()}</span>
              <span className="text-xs text-white">{details || "Activity recorded"}</span>
            </div>,
            { duration: 5000, icon: "🔔", style: { background: "#0A2514", color: "#fff", border: "1px solid #4CAF50" } }
          );
        }
      )
      .subscribe();

    const tasksChannel = supabase
      .channel("admin-notifier-tasks")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks" },
        (payload: any) => {
           const oldR = payload.old;
           const newR = payload.new;

           if (!oldR || !newR) return;

           // Only toast for ACTUAL status transitions to 'done' or reassignment
           if (oldR.status !== newR.status && newR.status === "done") {
             toast("Task COMPLETED by agent", { icon: "✅", id: `task-done-${newR.id}` });
           } else if (oldR.assigned_to !== newR.assigned_to && newR.assigned_to) {
             toast("Task RE-ASSIGNED", { icon: "🔄", id: `task-assign-${newR.id}` });
           }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(auditChannel);
      supabase.removeChannel(tasksChannel);
    };
  }, [profile, loading]);

  return null;
}
