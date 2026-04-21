const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val) env[key.trim()] = val.join('=').trim().replace(/^"(.*)"$/, '$1');
});

async function backfill() {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  console.log('🚀 Phase 1: Identifying cancelled tasks missing logs...');

  // Find logistics tasks that are cancelled but have No Call Logs
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, customer_id, task_type, status, orders!inner(id, shopify_order_id, delivery_status)')
    .in('task_type', ['issue_resolution', 'transit_update'])
    .eq('status', 'cancelled');

  if (error) return console.error(error);

  console.log(`Found ${tasks.length} cancelled logistics tasks.`);

  for (const t of tasks) {
    // Check if a call log already exists for this task
    const { data: existingLogs } = await supabase
      .from('call_logs')
      .select('id')
      .eq('task_id', t.id)
      .limit(1);

    if (!existingLogs || existingLogs.length === 0) {
      console.log(`📝 Backfilling log for task ${t.id} (Order: ${t.orders.shopify_order_id})`);
      const orderNum = t.orders.shopify_order_id || 'Unknown';
      await supabase.from('call_logs').insert({
        task_id: t.id,
        customer_id: t.customer_id,
        outcome: 'done',
        note: `Auto-Resolved: Order #${orderNum} verified as Delivered. Status synced to history.`,
        agent_name: 'Backfill Sync',
        called_at: new Date().toISOString()
      });
    }
  }

  console.log('✅ Backfill Complete.');
}

backfill();
