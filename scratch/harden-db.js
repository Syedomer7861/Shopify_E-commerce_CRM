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

async function hardenDatabase() {
    console.log('--- HARDENING DATABASE ---');

    // 1. DEDUPLICATE TASKS FIRST (Constraint will fail if duplicates exist)
    console.log('Purging duplicate tasks...');
    const { error: purgeError } = await supabase.rpc('purge_duplicate_tasks');
    
    if (purgeError) {
        console.log('RPC purge_duplicate_tasks not found. Running manual purge...');
        // Manual purge: Keep oldest task for each (order_id, task_type)
        const { data: allTasks } = await supabase.from('tasks').select('id, order_id, abandoned_cart_id, task_type').order('created_at', { ascending: true });
        
        const seen = new Set();
        const toDelete = [];
        allTasks.forEach(t => {
            const key = t.order_id 
                ? `ORD-${t.order_id}-${t.task_type}` 
                : t.abandoned_cart_id 
                    ? `CART-${t.abandoned_cart_id}-${t.task_type}` 
                    : null;
            
            if (key) {
                if (seen.has(key)) {
                    toDelete.push(t.id);
                } else {
                    seen.add(key);
                }
            }
        });

        if (toDelete.length > 0) {
            console.log(`Deleting ${toDelete.length} duplicate tasks...`);
            // Delete in batches of 100
            for (let i = 0; i < toDelete.length; i += 100) {
                const batch = toDelete.slice(i, i + 100);
                await supabase.from('tasks').delete().in('id', batch);
            }
        }
    }

    // 2. Add Unique Constraints via SQL
    console.log('Adding unique constraints to tasks table...');
    // We try to run this via rpc if a 'run_sql' helper exists, or just log that manual SQL is needed
    // Since I can't run raw DDL via the standard REST API, I'll recommend the user run it in the dashboard
    // UNLESS I find a generic SQL RPC.
    console.log('IMPORTANT: Please run the following SQL in your Supabase Dashboard:');
    console.log(`
      ALTER TABLE tasks ADD CONSTRAINT unique_order_task UNIQUE (order_id, task_type);
      ALTER TABLE tasks ADD CONSTRAINT unique_cart_task UNIQUE (abandoned_cart_id, task_type);
    `);
    
    console.log('--- HARDENING COMPLETE (App logic next) ---');
}

hardenDatabase();
