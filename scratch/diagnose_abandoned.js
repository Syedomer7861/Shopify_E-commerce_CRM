const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...value] = line.split('=');
  if (key && value) {
    env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function diagnose() {
  const { data: carts, error: cartErr } = await supabase.from('abandoned_carts').select('id, cart_token, phone, abandoned_at, recovery_status');
  console.log(`Total Abandoned Carts in DB: ${carts?.length || 0}`);
  
  const { data: recoveryTasks, error: taskErr } = await supabase.from('tasks').select('id, status, abandoned_cart_id').eq('task_type', 'recovery');
  const doneTasks = recoveryTasks?.filter(t => t.status === 'done') || [];
  const pendingTasks = recoveryTasks?.filter(t => t.status === 'pending') || [];
  
  console.log(`Recovery Tasks: Total=${recoveryTasks?.length || 0}, Pending=${pendingTasks.length}, Done=${doneTasks.length}`);
  
  if (carts && carts.length > 0) {
    console.log('Sample Carts:', carts.slice(0, 5));
  }
}

diagnose();
