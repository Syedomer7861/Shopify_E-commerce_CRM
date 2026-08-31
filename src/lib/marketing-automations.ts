import "server-only";
import { notifyUser } from "@/lib/notifications-server";

/**
 * Marketing automation runner. Mirrors the pattern in lib/workflow-engine.ts:
 * fetch enabled rules whose trigger matches, apply each action. Every call
 * site wraps this in try/catch — an automation failure must never fail the
 * user action that triggered it.
 *
 * Rule shape (mkt_automations):
 *   trigger: { event: 'status_changed', to?: '<statusId>' }
 *   actions: [
 *     { type: 'assign',       to: '<uuid>' }
 *     { type: 'set_priority', priority: 'urgent'|'high'|'normal'|'low' }
 *     { type: 'notify',       to?: '<uuid>' }        // omit -> notify each assignee
 *     { type: 'add_subtask',  title: '<string>' }
 *   ]
 */
type StatusChange = {
  task: {
    id: string;
    list_id: string;
    title: string;
    status: string;
    assignees?: string[] | null;
    watchers?: string[] | null;
  };
  toStatus: string;
  actorId: string;
};

export async function runStatusAutomations(supabase: any, { task, toStatus, actorId }: StatusChange) {
  const { data: rules } = await supabase
    .from("mkt_automations")
    .select("id, trigger, actions")
    .eq("enabled", true)
    .or(`list_id.is.null,list_id.eq.${task.list_id}`);

  if (!rules?.length) return;

  let assignees = Array.isArray(task.assignees) ? [...task.assignees] : [];

  for (const rule of rules) {
    const trig = rule.trigger ?? {};
    if (trig.event !== "status_changed") continue;
    if (trig.to && trig.to !== toStatus) continue;

    for (const action of Array.isArray(rule.actions) ? rule.actions : []) {
      try {
        if (action.type === "assign" && action.to) {
          if (!assignees.includes(action.to)) {
            assignees = [...assignees, action.to];
            await supabase.from("mkt_tasks").update({ assignees }).eq("id", task.id);
          }
        } else if (action.type === "set_priority" && action.priority) {
          await supabase.from("mkt_tasks").update({ priority: action.priority }).eq("id", task.id);
        } else if (action.type === "notify") {
          const targets = action.to ? [action.to] : assignees;
          await Promise.allSettled(
            targets
              .filter((id: string) => id && id !== actorId)
              .map((id: string) =>
                notifyUser(id, `"${task.title}" moved to ${toStatus}`, "Automation", `/marketing?task=${task.id}`, "info")
              )
          );
        } else if (action.type === "add_subtask" && action.title) {
          await supabase.from("mkt_tasks").insert({
            list_id: task.list_id,
            parent_task_id: task.id,
            title: action.title,
            status: task.status,
            position: 1000,
            created_by: actorId,
          });
        }
      } catch {
        /* one bad action shouldn't stop the rest */
      }
    }
  }
}
