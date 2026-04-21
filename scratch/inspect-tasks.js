const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually read .env
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const [key, ...vals] = trimmed.split('=');
  if (key && vals.length > 0) env[key.trim()] = vals.join('=').trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectTasks() {
    const { data: latestTasks } = await supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(20);
    console.log('--- LATEST 20 TASKS ---');
    latestTasks.forEach(t => {
        console.log(`ID: ${t.id} | Type: ${t.task_type} | Order: ${t.order_id} | Created: ${t.created_at}`);
    });

    const { count: orphans } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).is('order_id', null).is('abandoned_cart_id', null);
    console.log(`Total Orphans (No Order/Cart): ${orphans}`);
}

inspectTasks();
