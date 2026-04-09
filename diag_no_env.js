const { createClient } = require('@supabase/supabase-js');

// Pass env vars via process.env or hardcode (internal use only)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error('Missing URL or Key in environment');
    process.exit(1);
}

const supabase = createClient(url, key);

async function diagnose() {
  console.log('--- Order 18660 Diagnostics ---');
  const { data: oData, error: oError } = await supabase
    .from('orders')
    .select('id, order_number, customer_id, ordered_at, delivered_at, delivery_status, customers(id, name, phone)')
    .eq('order_number', '18660');
  
  if (oError) console.error('Order Error:', oError);
  else console.log('Orders for 18660:', JSON.stringify(oData, null, 2));

  console.log('\n--- Recent Tasks Count ---');
  const { count, error: tError } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true });
  
  if (tError) console.error('Task Error:', tError);
  else console.log('Total Tasks in System:', count);

  console.log('\n--- Task Eligibility Check (Random 20) ---');
  const { data: delivered } = await supabase
    .from('orders')
    .select('id, order_number')
    .eq('delivery_status', 'delivered')
    .not('delivered_at', 'is', null)
    .limit(20);
  
  if (delivered) {
    for (const o of delivered) {
      const { count: tc } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('order_id', o.id);
      console.log(`Order ${o.order_number} (${o.id}): ${tc} tasks`);
    }
  }
}

diagnose();
