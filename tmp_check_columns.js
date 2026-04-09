
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function check() {
  const { data, error } = await supabase.rpc('get_table_columns_v2', { table_name: 'abandoned_carts' });
  if (error) {
     const { data: sample } = await supabase.from('abandoned_carts').select('*').limit(1);
     console.log('Sample keys:', Object.keys(sample?.[0] || {}));
  } else {
     console.log(data);
  }
}
check();
