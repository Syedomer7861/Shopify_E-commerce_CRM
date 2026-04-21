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

async function diag() {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  console.log('🔍 Diagnostic: Fetching tasks for Parul Choudhary...');

  const { data: cust } = await supabase.from('customers').select('id, name').ilike('name', '%Parul%').limit(1).single();
  if (!cust) return console.log('Customer not found');

  console.log(`Customer ID: ${cust.id} (${cust.name})`);

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, task_type, order_id, abandoned_cart_id, status, due_date')
    .eq('customer_id', cust.id);

  console.log('Tasks:', JSON.stringify(tasks, null, 2));

  if (tasks && tasks.length > 0) {
    for (const t of tasks) {
        if (t.order_id) {
            const { data: order } = await supabase.from('orders').select('id, shopify_order_id, delivery_status').eq('id', t.order_id).maybeSingle();
            console.log(`Order for Task ${t.id}:`, order);
        }
    }
  }
}

diag();
