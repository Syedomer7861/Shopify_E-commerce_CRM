const { createClient } = require('@supabase/supabase-js');

// Hardcoded for debugging as per .env
const supabase = createClient(
  'https://mknxjfviqavylvsxsigs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbnhqZnZpcWF2eWx2c3hzaWdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjc5MSwiZXhwIjoyMDkwNjk4NzkxfQ.2L-LDcJRagQBNaUjMj6hDuKFxUFzY4Dt1OCKZMIzGoA'
);

async function testQuery() {
  console.log('--- Testing Call Logs Query ---');
  const start = new Date(Date.now() - 30 * 86400000).toISOString();
  const end = new Date().toISOString();

  // Test 1: Standard Select
  const { data: t1, count: c1, error: e1 } = await supabase
    .from('call_logs')
    .select('*, customer:customers(*)', { count: 'exact' });
  
  if (e1) console.error('T1 Error:', e1);
  else console.log('T1 Success! Total Rows in Table:', c1);

  // Test 2: Date Filter
  const { data: t2, error: e2 } = await supabase
    .from('call_logs')
    .select('*')
    .gte('created_at', start)
    .lte('created_at', end);
  
  if (e2) console.error('T2 (Date) Error:', e2);
  else console.log('T2 Success! Rows in range:', t2.length);

  // Test 3: Attributed Instance Filter
  console.log('\n--- Testing Orders Attribution Column ---');
  const { data: t3, error: e3 } = await supabase
    .from('orders')
    .select('total_price, attributed_instance_id')
    .limit(1);

  if (e3) {
    console.error('T3 Error (Attr Column doesn\'t exist?):', e3);
  } else {
    console.log('T3 Success! Attr Column found.');
  }

  // Test 4: Relationship Filter
  console.log('\n--- Testing Inner Join Filter ---');
  const { data: t4, error: e4 } = await supabase
    .from('call_logs')
    .select('*, customer:customers!inner(*)')
    .eq('customer.state', 'MAHARASHTRA')
    .limit(1);

  if (e4) {
    console.error('T4 Error (Relationship Syntax?):', e4);
  } else {
    console.log('T4 Success! Inner join filter works.');
  }
}

testQuery();
