const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://mknxjfviqavylvsxsigs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbnhqZnZpcWF2eWx2c3hzaWdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjc5MSwiZXhwIjoyMDkwNjk4NzkxfQ.2L-LDcJRagQBNaUjMj6hDuKFxUFzY4Dt1OCKZMIzGoA'
);

async function inspectSchema() {
  console.log('--- Inspecting Orders ---');
  const { data: o, error: e1 } = await supabase.from('orders').select('*').limit(1);
  if (e1) console.error('Orders Error:', e1);
  else if (o.length > 0) console.log('Orders Columns:', Object.keys(o[0]));
  else console.log('Orders: No data to inspect schema.');

  console.log('\n--- Inspecting Call Logs ---');
  const { data: c, error: e2 } = await supabase.from('call_logs').select('*').limit(1);
  if (e2) console.error('Call Logs Error:', e2);
  else if (c.length > 0) console.log('Call Logs Columns:', Object.keys(c[0]));
  else console.log('Call Logs: No data to inspect schema.');
  
  console.log('\n--- Inspecting Webhook Logs ---');
  const { data: w, error: e3 } = await supabase.from('webhook_logs').select('*').limit(1);
  if (e3) console.error('Webhook Logs Error:', e3);
  else if (w.length > 0) console.log('Webhook Logs Columns:', Object.keys(w[0]));
}

inspectSchema();
