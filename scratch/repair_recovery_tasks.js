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

async function repair() {
  console.log('🚀 Starting Abandoned Cart Repair...');

  // 1. Fetch all carts and their customers
  const { data: carts } = await supabase.from('abandoned_carts').select('*, customer:customers(id, phone, name)');
  console.log(`Analyzing ${carts?.length || 0} carts...`);

  // 2. Identify and fix collisions (Unknown Phone)
  // If multiple carts share a placeholder phone or 'unknown', we may need to split them.
  // Actually, let's just ensure every cart has a task.

  let created = 0;
  let reopened = 0;

  for (const cart of (carts || [])) {
    // A. Check if task exists
    const { data: existingTask } = await supabase
      .from('tasks')
      .select('id, status')
      .eq('abandoned_cart_id', cart.id)
      .maybeSingle();

    // B. Check if a VALID order exists AFTER abandonment
    const { data: validOrder } = await supabase
      .from('orders')
      .select('id, ordered_at')
      .eq('customer_id', cart.customer_id)
      .gt('ordered_at', cart.abandoned_at)
      .limit(1)
      .maybeSingle();

    const shouldBeDone = !!validOrder;

    if (!existingTask) {
      if (!shouldBeDone) {
        // Create new pending task
        const recoveryDate = new Date(cart.abandoned_at);
        recoveryDate.setHours(recoveryDate.getHours() + 24);
        
        await supabase.from('tasks').insert({
          abandoned_cart_id: cart.id,
          customer_id: cart.customer_id,
          task_type: 'recovery',
          due_date: recoveryDate.toISOString().split('T')[0],
          status: 'pending',
          priority_score: 50
        });
        created++;
      }
    } else if (existingTask.status === 'done' && !shouldBeDone) {
      // Re-open incorrectly closed task
      await supabase.from('tasks').update({ status: 'pending', completed_at: null }).eq('id', existingTask.id);
      reopened++;
    }
  }

  console.log('✅ Repair Finished!');
  console.log(`New Tasks Created: ${created}`);
  console.log(`Tasks Re-opened: ${reopened}`);
}

repair();
