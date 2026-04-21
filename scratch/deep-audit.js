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

async function deepAudit() {
    console.log('--- DEEP TASK AUDIT ---');
    const { count } = await supabase.from('tasks').select('*', { count: 'exact', head: true });
    console.log(`Total Tasks in DB: ${count}`);

    const { data: stats } = await supabase.rpc('get_task_stats_v2'); 
    // If RPC fails, use basic group by
    if (!stats) {
        const { data: allTasks } = await supabase.from('tasks').select('task_type, status');
        const summary = {};
        allTasks.forEach(t => {
            const k = `${t.task_type} (${t.status})`;
            summary[k] = (summary[k] || 0) + 1;
        });
        console.log('Task Breakdown:', summary);
    }

    // Check for "Transit Inform" tasks - these are usually the ones that explode
    const { data: transitTasks } = await supabase.from('tasks').select('id, order_id').eq('task_type', 'transit_inform').limit(10);
    console.log('Sample Transit Inform tasks:', transitTasks);
}

deepAudit();
