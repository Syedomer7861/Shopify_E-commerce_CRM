const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function rebuild() {
  console.log("--- REBUILDING AGENT LEADERBOARD DATA ---");

  // 1. Fetch all completed tasks
  const { data: doneTasks, error } = await supabase
    .from('tasks')
    .select('id, assigned_to, completed_at, task_type, order_id, orders(total_price), customers(name)')
    .eq('status', 'done')
    .not('completed_at', 'is', null);

  if (error) {
    console.error("Error fetching tasks:", error);
    return;
  }

  console.log(`Found ${doneTasks.length} completed tasks.`);

  // 2. Fetch existing activity logs to avoid duplicates
  const { data: existingLogs } = await supabase.from('agent_activity_logs').select('reference_id');
  const existingIds = new Set(existingLogs?.map(l => l.reference_id) || []);

  const logsToInsert = [];
  for (const task of doneTasks) {
    if (existingIds.has(task.id)) continue;
    if (!task.assigned_to) continue;

    logsToInsert.push({
      agent_id: task.assigned_to,
      activity_type: 'call', // Default to call for historical data
      reference_id: task.id,
      created_at: task.completed_at,
      metadata: {
        task_type: task.task_type,
        customer_name: task.customers?.name,
        revenue: task.orders?.total_price || 0,
        historical: true
      }
    });
  }

  console.log(`Inserting ${logsToInsert.length} missing activity logs...`);
  
  if (logsToInsert.length > 0) {
    const { error: insertErr } = await supabase.from('agent_activity_logs').insert(logsToInsert);
    if (insertErr) console.error("Error inserting logs:", insertErr);
    else console.log("Success!");
  }

  console.log("--- REBUILD COMPLETE ---");
}

rebuild();
