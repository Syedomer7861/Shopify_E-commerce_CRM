import "server-only";
import { notifyUser } from "@/lib/notifications-server";

/**
 * Workspace automation runner. Mirrors lib/workflow-engine.ts: fetch enabled
 * rules whose trigger matches, apply each action. Every call site wraps this
 * in try/catch — an automation failure must never fail the user action.
 *
 * trigger: { event: 'status_changed', to?: '<statusId>' }
 *          { event: 'task_created' }
 * actions:
 *   { type: 'assign',        to: '<uuid>' }
 *   { type: 'set_priority',  priority: 'urgent'|'high'|'normal'|'low' }
 *   { type: 'notify',        to?: '<uuid>' }           // omit -> assignees
 *   { type: 'add_subtask',   title: '<string>' }
 *   { type: 'move_to_list',  list_id: '<uuid>' }
 *   { type: 'set_field',     field: '<fieldId>', value: <any> }
 *   { type: 'set_due_date',  days: <int> }             // now + days
 *   { type: 'run_campaign',  segment: '<string>', name?: '<string>' }  // creates a DRAFT campaign
 */
type RunArgs = {
  event: "status_changed" | "task_created";
  task: {
    id: string;
    list_id: string;
    title: string;
    status: string;
    assignees?: string[] | null;
    watchers?: string[] | null;
    custom_fields?: Record<string, any> | null;
  };
  toStatus?: string;
  actorId: string;
};

export async function runAutomations(supabase: any, { event, task, toStatus, actorId }: RunArgs) {
  const { data: rules } = await supabase
    .from("mkt_automations")
    .select("id, trigger, actions")
    .eq("enabled", true)
    .or(`list_id.is.null,list_id.eq.${task.list_id}`);

  if (!rules?.length) return;

  let assignees = Array.isArray(task.assignees) ? [...task.assignees] : [];
  let fields = { ...(task.custom_fields ?? {}) };

  for (const rule of rules) {
    const trig = rule.trigger ?? {};
    if (trig.event !== event) continue;
    if (event === "status_changed" && trig.to && trig.to !== toStatus) continue;

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
                notifyUser(id, `Automation: "${task.title}"`, event === "status_changed" ? `Moved to ${toStatus}` : "New task", `/workspace?task=${task.id}`, "info")
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
        } else if (action.type === "move_to_list" && action.list_id && action.list_id !== task.list_id) {
          const { data: dest } = await supabase.from("mkt_lists").select("statuses").eq("id", action.list_id).single();
          const firstStatus = (dest?.statuses as Array<{ id: string }> | undefined)?.[0]?.id ?? task.status;
          await supabase.from("mkt_tasks").update({ list_id: action.list_id, status: firstStatus }).eq("id", task.id);
          task.list_id = action.list_id;
          task.status = firstStatus;
        } else if (action.type === "set_field" && action.field) {
          fields = { ...fields, [action.field]: action.value ?? null };
          await supabase.from("mkt_tasks").update({ custom_fields: fields }).eq("id", task.id);
        } else if (action.type === "set_due_date" && Number.isFinite(action.days)) {
          const d = new Date();
          d.setDate(d.getDate() + Number(action.days));
          await supabase.from("mkt_tasks").update({ due_date: d.toISOString().slice(0, 10) }).eq("id", task.id);
        } else if (action.type === "run_campaign" && action.segment) {
          // Never auto-send. Create a DRAFT the marketing team can review + launch.
          await supabase.from("campaigns").insert({
            name: action.name || `[auto] ${task.title}`,
            target_segment: action.segment,
            status: "draft",
          });
        }
      } catch {
        /* one bad action shouldn't stop the rest */
      }
    }
  }
}

// Back-compat: existing import name.
export const runStatusAutomations = (
  supabase: any,
  a: { task: RunArgs["task"]; toStatus: string; actorId: string }
) => runAutomations(supabase, { event: "status_changed", ...a });
