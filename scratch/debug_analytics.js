const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testQuery() {
  console.log('--- Testing Call Logs Query ---');
  const start = new Date(Date.now() - 30 * 86400000).toISOString();
  const end = new Date().toISOString();

  // Test the EXACT query from reports/page.tsx
  const { data, count, error } = await supabase
    .from('call_logs')
    .select('*, customer:customers(*)', { count: 'exact' })
    .gte('created_at', start)
    .lte('created_at', end);

  if (error) {
    console.error('Call Logs Error:', error);
  } else {
    console.log('Call Logs Success! Count:', count);
    if (data && data.length > 0) console.log('Sample Log ID:', data[0].id);
  }

  console.log('\n--- Testing Orders Attribution Query ---');
  const { data: metaData, error: metaErr } = await supabase
    .from('orders')
    .select('total_price')
    .not('attributed_instance_id', 'is', null)
    .gte('ordered_at', start)
    .lte('ordered_at', end);

  if (metaErr) {
    console.error('Meta Attribution Error:', metaErr);
  } else {
    console.log('Meta Attribution Success! Count:', metaData.length);
  }
}

testQuery();
