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

async function runAudit() {
    console.log('--- TASK DUPLICATION AUDIT ---');
    
    // Check for Duplicate Order Tasks
    const { data: orderTasks, error: e1 } = await supabase.rpc('get_duplicate_tasks_by_order');
    // If RPC doesn't exist, we manually query
    if (e1) {
        const { data: allTasks } = await supabase.from('tasks').select('id, order_id, abandoned_cart_id, task_type').not('order_id', 'is', null);
        const map = {};
        allTasks.forEach(t => {
            const key = `${t.order_id}-${t.task_type}`;
            if (!map[key]) map[key] = [];
            map[key].push(t.id);
        });
        const duplicates = Object.values(map).filter(ids => ids.length > 1);
        console.log(`Sets of duplicate order tasks: ${duplicates.length}`);
        console.log(`Total duplicate order task records to remove: ${duplicates.reduce((acc, ids) => acc + ids.length - 1, 0)}`);
    }

    // Check for Duplicate Recovery Tasks
    const { data: allTasksR } = await supabase.from('tasks').select('id, abandoned_cart_id, task_type').not('abandoned_cart_id', 'is', null);
    const mapR = {};
    allTasksR.forEach(t => {
        const key = `${t.abandoned_cart_id}-${t.task_type}`;
        if (!mapR[key]) mapR[key] = [];
        mapR[key].push(t.id);
    });
    const duplicatesR = Object.values(mapR).filter(ids => ids.length > 1);
    console.log(`Sets of duplicate recovery tasks: ${duplicatesR.length}`);
    console.log(`Total duplicate recovery task records to remove: ${duplicatesR.reduce((acc, ids) => acc + ids.length - 1, 0)}`);
}

runAudit();
