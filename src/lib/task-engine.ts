import type { TaskType } from "@/types";

export function calculateTaskPriority(input: {
  taskType: TaskType;
  dueDate?: string | null;
  totalPrice?: number | null;
  totalOrders?: number | null;
  rtoFlag?: boolean | null;
  overdueDays?: number | null;
  customerSegment?: string | null;
  isPriorityOverride?: boolean | null;
}) {
  let score = 0;

  // 1. Base Task Type Weighting (Criticality)
  const taskWeights: Record<string, number> = {
    issue_resolution: 120, // Highest priority: problem solving
    recovery: 80,         // High value: capturing lost revenue
    reorder: 50,          // Medium: nurturing repeat customers
    transit_update: 40,   // Medium-Low: proactive support
    final_followup: 30,    // Low: last touch
    review: 15             // Brand building
  };
  score += taskWeights[input.taskType] || 0;

  // 2. Financial Value Weighting (Revenue Potential)
  const price = Number(input.totalPrice || 0);
  if (price >= 5000) score += 40;
  else if (price >= 3000) score += 25;
  else if (price >= 1500) score += 15;

  // 3. Customer Loyalty (LTV Potential)
  const orders = Number(input.totalOrders || 0);
  if (orders >= 5) score += 30; // VIP
  else if (orders >= 2) score += 15; // Repeat

  // 4. Risk Factors (Negative weighting or high priority for resolution)
  if (input.rtoFlag) {
    if (input.taskType === "issue_resolution") score += 20; // Resolve RTO issues fast
    else score -= 15; // De-prioritize regular marketing for chronic RTO customers
  }

  // 5. Segment Specifics
  if (input.customerSegment === "risky") score += 20; // High touch needed
  if (input.customerSegment === "repeat") score += 10;

  // 6. Urgency (Time Decay/Pressure)
  const overdue = Number(input.overdueDays || 0);
  if (overdue > 0) {
    // Aggressive scaling for first 3 days, then plateaus to avoid drowning in old tasks
    score += Math.min(45, overdue * 6);
  }

  // 7. Manual Priority Override (Product Courses)
  if (input.isPriorityOverride) {
    score += 50;
  }

  return score;
}

export function getEscalationLevel(overdueDays: number) {
  if (overdueDays >= 7) return "critical";
  if (overdueDays >= 3) return "high";
  if (overdueDays >= 1) return "medium";
  return "normal";
}

/**
 * assignTaskOwner - Optimized for load & presence awareness.
 * 
 * Priority order:
 * 1. Online agents (last_seen_at within 5 minutes) with least workload
 * 2. Recently active agents (last_seen_at within 1 hour) with least workload
 * 3. Any active agent with least workload (fallback)
 */
export async function assignTaskOwner(supabase: any) {
  // 1. Fetch all active agents with presence data
  const { data: agents } = await supabase
    .from("profiles")
    .select("id, name, is_active, last_seen_at")
    .eq("is_active", true)
    .eq("role", "agent")
    .eq("status", "online");

  if (!agents || agents.length === 0) {
    // Fallback: try admins if no agents exist
    const { data: admins } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_active", true)
      .eq("role", "admin")
      .limit(1);
    return admins?.[0]?.id || null;
  }

  // 2. Categorize agents by presence
  const now = Date.now();
  const fiveMinAgo = now - 5 * 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;

  const onlineAgents = agents.filter((a: any) => a.last_seen_at && new Date(a.last_seen_at).getTime() > fiveMinAgo);
  const recentAgents = agents.filter((a: any) => a.last_seen_at && new Date(a.last_seen_at).getTime() > oneHourAgo);

  // Pick the best pool: online > recent > all active
  const pool = onlineAgents.length > 0 ? onlineAgents : recentAgents.length > 0 ? recentAgents : agents;

  // 3. Get current active task counts for each agent in the pool
  const { data: workloads, error } = await supabase
    .from("tasks")
    .select("assigned_to")
    .eq("status", "pending");

  if (error) return pool[0].id; // Fallback to first agent

  const countMap: Record<string, number> = {};
  pool.forEach((a: any) => countMap[a.id] = 0);
  workloads?.forEach((w: any) => {
    if (w.assigned_to && countMap[w.assigned_to] !== undefined) {
      countMap[w.assigned_to]++;
    }
  });

  // 4. Find agent with minimum workload
  let minAgentId = pool[0].id;
  let minCount = countMap[minAgentId];

  for (const agent of pool) {
    if (countMap[agent.id] < minCount) {
      minCount = countMap[agent.id];
      minAgentId = agent.id;
    }
  }

  return minAgentId;
}

/**
 * Sweeps for agents who have logged off (no heartbeat in 30 mins),
 * takes their "Due Today" and "Overdue" pending tasks, and reassigns them
 * to agents currently online to prevent tasks from going stale.
 */
export async function reassignOfflineAgentTasks(supabase: any) {
  const now = Date.now();
  const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();
  const thirtyMinAgo = new Date(now - 30 * 60 * 1000).toISOString();
  const today = new Date().toISOString().split("T")[0];

  // 1. Check if there are any strictly ONLINE agents right now
  const { data: onlineAgents } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_active", true)
    .eq("role", "agent")
    .gt("last_seen_at", fiveMinAgo);

  // If the whole office is closed (nobody online), abort. Don't shuffle tasks pointlessly.
  if (!onlineAgents || onlineAgents.length === 0) return 0;

  // 2. Find OFFLINE agents (no heartbeat for 30+ mins)
  const { data: offlineAgents } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_active", true)
    .eq("role", "agent")
    .lt("last_seen_at", thirtyMinAgo);

  if (!offlineAgents || offlineAgents.length === 0) return 0;

  const offlineIds = offlineAgents.map((a: any) => a.id);

  // 3. Grab urgent pending tasks assigned to these offline agents
  const { data: endangeredTasks, error } = await supabase
    .from("tasks")
    .select("id, assigned_to")
    .eq("status", "pending")
    .lte("due_date", today) // Due today or overdue
    .in("assigned_to", offlineIds);

  if (error || !endangeredTasks || endangeredTasks.length === 0) return 0;

  // 4. Reassign them to the active online pool
  let reassignedCount = 0;
  for (const task of endangeredTasks) {
    const newOwnerId = await assignTaskOwner(supabase);
    
    // Only update if it actually shifted to a new person
    if (newOwnerId && newOwnerId !== task.assigned_to) {
      await supabase
        .from("tasks")
        .update({ assigned_to: newOwnerId })
        .eq("id", task.id);
      reassignedCount++;
    }
  }

  return reassignedCount;
}
