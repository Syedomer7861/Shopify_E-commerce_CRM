const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env because we are in a standalone script
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val) env[key.trim()] = val.join('=').trim().replace(/^"(.*)"$/, '$1');
});

async function forceHeal() {
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('🚀 Phase 1: Identifying stale logistics tasks...');

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, customer_id, task_type, orders!inner(id, delivery_status, shopify_order_id)')
    .in('task_type', ['issue_resolution', 'transit_update'])
    .not('status', 'in', '("done","cancelled","skipped")');

  if (error) {
    console.error('❌ Error fetching tasks:', error);
    process.exit(1);
  }

  // Filter for delivered orders (case insensitive)
  const stale = tasks.filter(t => 
    t.orders && 
    String(t.orders.delivery_status || '').toLowerCase() === 'delivered'
  );

  console.log(`🔍 Found ${stale.length} stale tasks for delivered orders.`);

  if (stale.length === 0) {
    console.log('✅ No stale tasks found. Dashboard is clean.');
    process.exit(0);
  }

  let count = 0;
  for (const task of stale) {
    const { error: updErr } = await supabase
      .from('tasks')
      .update({ status: 'cancelled' })
      .eq('id', task.id);

    if (!updErr) {
        await supabase.from('call_logs').insert({
            task_id: task.id,
            customer_id: task.customer_id,
            outcome: 'done',
            note: `Auto-resolved: Order ${task.orders.shopify_order_id} reached 'delivered' status. (Force Sweep)`,
            agent_name: 'System Force-Heal'
        });
        count++;
        console.log(`✅ Cancelled task ${task.id} (Order: ${task.orders.shopify_order_id})`);
    } else {
        console.error(`❌ Failed to cancel task ${task.id}:`, updErr);
    }
  }

  console.log(`🎉 Cleanup Complete! Successfully cancelled ${count} ghost tasks.`);
}

forceHeal();
