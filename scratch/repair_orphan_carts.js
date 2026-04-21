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
  console.log('🚀 Starting Identity-Healing for Orphan Carts...');

  // 1. Fetch all orphan carts (customer_id is null)
  const { data: orphans } = await supabase
    .from('abandoned_carts')
    .select('*')
    .is('customer_id', null);

  console.log(`Found ${orphans?.length || 0} orphan carts.`);

  let customersCreated = 0;
  let tasksGenerated = 0;

  for (const cart of (orphans || [])) {
    // A. Extract metadata
    const metadata = cart.line_items?.[cart.line_items.length - 1];
    const payload = metadata?.payload || {};
    
    const phone = payload.mobile || payload.phone || payload.customer_phone || cart.phone || '';
    const email = payload.email || payload.customer_email || cart.email || '';
    const name = payload.customer_name || payload.shipping_address?.name || payload.billing_address?.name || '';

    // B. Identity Resolution: If we have a phone or email, we can heal
    const identityPhone = phone || (cart.cart_token ? `GUEST-${cart.cart_token}` : null);
    
    if (identityPhone) {
        // Step 1: Create/Update Customer
        const { data: customerArr } = await supabase.from('customers').upsert({
            name: name || 'Checkout Guest',
            phone: identityPhone,
            email: email || null
        }, { onConflict: 'phone' }).select('id');

        const customer = customerArr?.[0];
        if (customer) {
            // Step 2: Link Cart
            await supabase.from('abandoned_carts').update({ customer_id: customer.id }).eq('id', cart.id);
            customersCreated++;

            // Step 3: Create Task if not "ghost" (has some contact info or name)
            if (phone || email || name) {
                const recoveryDate = new Date(cart.abandoned_at || new Date());
                recoveryDate.setHours(recoveryDate.getHours() + 24);

                await supabase.from('tasks').upsert({
                    abandoned_cart_id: cart.id,
                    customer_id: customer.id,
                    task_type: 'recovery',
                    due_date: recoveryDate.toISOString().split('T')[0],
                    status: 'pending',
                    priority_score: 50
                }, { onConflict: 'abandoned_cart_id, task_type' });
                tasksGenerated++;
            }
        }
    }
  }

  console.log('✅ Identity-Healing Finished!');
  console.log(`Customers Healed: ${customersCreated}`);
  console.log(`New Recovery Tasks: ${tasksGenerated}`);
}

repair();
