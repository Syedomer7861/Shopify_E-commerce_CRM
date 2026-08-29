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
  stockLevel?: number | null;
}) {
  let score = 0;

  // 1. Base Task Type Weighting (Criticality)
  const taskWeights: Record<string, number> = {
    vip_followup: 130,     // Critical: High-value customer retention
    issue_resolution: 120, // Highest priority: problem solving
    cod_verify: 110,       // Critical: Confirm COD before shipping
    ndr: 100,              // High: Fix delivery failures
    welcome_call: 90,      // High: New customer experience
    recovery: 80,         // High value: capturing lost revenue
    win_back: 60,         // Medium: Re-engaging dormant customers
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

  // 8. Inventory Awareness (Recovery Optimization)
  // If stock is low (< 5), give a bonus to recovery tasks to capture remaining inventory value
  if (input.taskType === "recovery" && input.stockLevel !== null && input.stockLevel !== undefined) {
    if (input.stockLevel > 0 && input.stockLevel < 5) {
      score += 35; // Significant bonus for low stock items
    } else if (input.stockLevel === 0) {
      score -= 50; // De-prioritize if out of stock
    }
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
export async function assignTaskOwner(supabase: any, taskType?: string, customerSegment?: string) {
  // 1. Fetch ALL active agents (online + offline) to ensure specializations are respected
  const { data: agents } = await supabase
    .from("profiles")
    .select("id, name, is_active, last_seen_at, assigned_task_types, assigned_segments, status")
    .eq("is_active", true)
    .eq("role", "agent")
    .not("email", "ilike", "%demo%")
    .not("name", "ilike", "%demo%")
    .or('is_demo.is.null,is_demo.eq.false');

  if (!agents || agents.length === 0) {
    // Fallback: try managers/admins if no agents exist
    const { data: staff } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_active", true)
      .in("role", ["admin", "manager"])
      .not("email", "ilike", "%demo%")
      .not("name", "ilike", "%demo%")
      .or('is_demo.is.null,is_demo.eq.false')
      .limit(1);
    return staff?.[0]?.id || null;
  }

  // 2. Filter pool by specialization (Strict Enforcement)
  let specializedPool: any[] = [];
  let generalPool: any[] = [];

  if (taskType || customerSegment) {
    agents.forEach((a: any) => {
      const isGeneralType = !a.assigned_task_types || a.assigned_task_types.length === 0;
      const isGeneralSegment = !a.assigned_segments || a.assigned_segments.length === 0;
      
      const typeMatch = isGeneralType || a.assigned_task_types.includes(taskType);
      const segmentMatch = isGeneralSegment || a.assigned_segments.includes(customerSegment);
      
      if (typeMatch && segmentMatch) {
        // Did they explicitly match either the type or segment?
        const explicitType = !isGeneralType && a.assigned_task_types.includes(taskType);
        const explicitSegment = !isGeneralSegment && a.assigned_segments.includes(customerSegment);
        
        if (explicitType || explicitSegment) {
          specializedPool.push(a);
        } else {
          generalPool.push(a);
        }
      }
    });
  } else {
    generalPool = agents;
  }

  // If we have specialized agents, use them exclusively. Otherwise fallback to general matching agents.
  let activePool = specializedPool.length > 0 ? specializedPool : generalPool;

  // If no one matches (not even general agents), fallback to managers/admins
  if (activePool.length === 0) {
    const { data: staff } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_active", true)
      .in("role", ["admin", "manager"])
      .not("email", "ilike", "%demo%")
      .not("name", "ilike", "%demo%")
      .or('is_demo.is.null,is_demo.eq.false')
      .limit(1);
    return staff?.[0]?.id || null;
  }

  // 3. Categorize agents by presence
  const now = Date.now();
  const fiveMinAgo = now - 5 * 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;

  const onlineAgents = activePool.filter((a: any) => a.last_seen_at && new Date(a.last_seen_at).getTime() > fiveMinAgo);
  const recentAgents = activePool.filter((a: any) => a.last_seen_at && new Date(a.last_seen_at).getTime() > oneHourAgo);

  // Pick the best pool: online > recent > all active in activePool
  const pool = onlineAgents.length > 0 ? onlineAgents : recentAgents.length > 0 ? recentAgents : activePool;

  // 4. Get current active task counts for each agent in the pool
  // "pending" alone undercounts real workload - a task that misses its due
  // date flips to "overdue" (see cron/overdue-marker) and is still very
  // much an open task the agent owns, just no longer visible to this
  // count. Confirmed live: thousands of real active tasks were sitting in
  // "overdue" and invisible here, so an agent buried in overdue work still
  // looked idle to the balancer and kept getting more piled on.
  const { data: workloads, error } = await supabase
    .from("tasks")
    .select("assigned_to")
    .in("status", ["pending", "overdue"]);

  if (error) return pool[0].id; // Fallback to first agent

  const countMap: Record<string, number> = {};
  pool.forEach((a: any) => countMap[a.id] = 0);
  workloads?.forEach((w: any) => {
    if (w.assigned_to && countMap[w.assigned_to] !== undefined) {
      countMap[w.assigned_to]++;
    }
  });

  // 5. Find agent with minimum workload
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
    .not("email", "ilike", "%demo%")
    .not("name", "ilike", "%demo%")
    .gt("last_seen_at", fiveMinAgo)
    .or('is_demo.is.null,is_demo.eq.false');

  // If the whole office is closed (nobody online), abort. Don't shuffle tasks pointlessly.
  if (!onlineAgents || onlineAgents.length === 0) return 0;

  // 2. Find OFFLINE agents (no heartbeat for 30+ mins)
  const { data: offlineAgents } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_active", true)
    .eq("role", "agent")
    .not("email", "ilike", "%demo%")
    .not("name", "ilike", "%demo%")
    .lt("last_seen_at", thirtyMinAgo)
    .or('is_demo.is.null,is_demo.eq.false');

  if (!offlineAgents || offlineAgents.length === 0) return 0;

  const offlineIds = offlineAgents.map((a: any) => a.id);

  // 3. Grab urgent pending tasks assigned to these offline agents
  const { data: endangeredTasks, error } = await supabase
    .from("tasks")
    .select("id, assigned_to, task_type, customer:customers(segment)")
    .eq("status", "pending")
    .lte("due_date", today) // Due today or overdue
    .in("assigned_to", offlineIds);

  if (error || !endangeredTasks || endangeredTasks.length === 0) return 0;

  // 4. Reassign them to the active online pool
  let reassignedCount = 0;
  for (const task of endangeredTasks) {
    const newOwnerId = await assignTaskOwner(supabase, task.task_type, (task.customer as any)?.segment);
    
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

/**
 * Automatically creates a "Manager Audit" task when an agent completes a task.
 * This ensures the manager (Mukesh) can review the order/action taken.
 */
export async function triggerAuditTask(supabase: any, originalTask: any) {
  // 1. Find a Manager (Priority: Mukesh, fallback: any active manager)
  const { data: managers } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_active", true)
    .eq("role", "manager")
    .not("email", "ilike", "%demo%")
    .not("name", "ilike", "%demo%")
    .or('is_demo.is.null,is_demo.eq.false')
    .order("name", { ascending: true });

  const realManagers = (managers || []).filter((m: any) => {
    const isDemoEmail = m.email?.toLowerCase().includes("demo");
    const isDemoName = m.name?.toLowerCase().includes("demo");
    return !m.is_demo && !isDemoEmail && !isDemoName;
  });

  const managerId = realManagers?.find((m: any) => m.id === "edb84312-ffbd-4e3b-a823-ff31477fce92")?.id || realManagers?.[0]?.id;

  if (!managerId) return null;

  if (!originalTask.customer_id) {
    console.error("Cannot create audit task: Missing customer_id", originalTask);
    return null;
  }

  // 2. Create the Audit Task
  const { data: newTask, error } = await supabase
    .from("tasks")
    .insert({
      customer_id: originalTask.customer_id,
      order_id: originalTask.order_id,
      abandoned_cart_id: originalTask.abandoned_cart_id,
      task_type: "manager_audit",
      due_date: new Date().toISOString().split("T")[0],
      assigned_to: managerId,
      status: "pending",
      priority_score: originalTask.priority_score || 50,
      metadata: { 
        audit_note: `Audit required for completed ${originalTask.task_type}. Outcome: ${originalTask.outcome || 'N/A'}. Agent: ${originalTask.agent_email || 'System'}`,
        original_task_id: originalTask.id
      }
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      console.warn("Audit task already exists for this order/event, skipping creation.");
      return null;
    }
    console.error("Failed to create audit task:", error.message, error.details);
    return null;
  }

  return newTask;
}

/**
 * Insert generated tasks, treating an existing row as success.
 *
 * The task generators re-run on a schedule and re-derive the same tasks for
 * the same order, which collides with the unique_order_task constraint and
 * fills the logs with 23505 / HTTP 409. A duplicate here means the task was
 * already created on an earlier pass — that is the desired end state, not an
 * error worth reporting.
 *
 * Returns how many rows were actually new.
 */
export async function insertTasksIgnoringDuplicates(
  supabase: any,
  rows: any[]
): Promise<{ inserted: number; error: string | null }> {
  if (!rows?.length) return { inserted: 0, error: null };

  // unique_order_task is UNIQUE (order_id, task_type), so naming it as the
  // conflict target lets Postgres skip the rows that already exist in a single
  // round trip instead of rejecting the whole batch.
  const { data, error } = await supabase
    .from("tasks")
    .upsert(rows, { onConflict: "order_id,task_type", ignoreDuplicates: true })
    .select("id");

  if (!error) return { inserted: data?.length ?? 0, error: null };

  // 23505 = unique_violation. Reachable if a row collides on some other
  // constraint; fall back to one-at-a-time so a single bad row cannot cost
  // us the whole batch.
  if (error.code === "23505") {
    let inserted = 0;
    for (const row of rows) {
      const { error: rowErr } = await supabase.from("tasks").insert(row);
      if (!rowErr) inserted++;
      else if (rowErr.code !== "23505") {
        return { inserted, error: rowErr.message };
      }
    }
    return { inserted, error: null };
  }

  return { inserted: 0, error: error.message };
}
