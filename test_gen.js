const { createClient } = require('@supabase/supabase-js');

const url = "https://mknxjfviqavylvsxsigs.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbnhqZnZpcWF2eWx2c3hzaWdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjc5MSwiZXhwIjoyMDkwNjk4NzkxfQ.2L-LDcJRagQBNaUjMj6hDuKFxUFzY4Dt1OCKZMIzGoA";

const supabase = createClient(url, key);

async function testTaskGen() {
  console.log('Fetching order 18660...');
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select('id, customer_id, delivered_at, line_items, delivery_status')
    .eq('order_number', '18660')
    .single();

  if (oErr) { console.error('Order Fetch Error:', oErr); return; }
  console.log('Order found:', JSON.stringify(order, null, 2));

  console.log('Checking for existing tasks...');
  const { data: existing } = await supabase.from('tasks').select('*').eq('order_id', order.id);
  console.log('Existing tasks:', existing?.length);

  const { data: settings } = await supabase.from('settings').select('*').single();
  console.log('Settings:', JSON.stringify(settings, null, 2));

  const deliveredDate = new Date(order.delivered_at);
  console.log('Delivered Date Parsed:', deliveredDate.toISOString());

  const addDays = (d, n) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r.toISOString().split('T')[0];
  };

  const tasks = [
    { task_type: 'review', due_date: addDays(deliveredDate, settings?.review_offset_days || 5) }
  ];

  console.log('Upserting task:', tasks[0]);
  const { data: tResult, error: tErr } = await supabase.from('tasks').upsert({
    order_id: order.id,
    customer_id: order.customer_id,
    ...tasks[0],
    status: 'pending'
  }, { onConflict: 'order_id, task_type' });

  if (tErr) console.error('Task Upsert ERROR:', tErr);
  else console.log('Task Upsert SUCCESS');
}

testTaskGen();
