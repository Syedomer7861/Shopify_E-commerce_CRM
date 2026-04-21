const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val) env[key.trim()] = val.join('=').trim().replace(/^"(.*)"$/, '$1');
});

async function check() {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  console.log('🔍 Checking call_logs for Parul...');

  const { data: calls, error } = await supabase
    .from('call_logs')
    .select('*')
    .eq('customer_id', '744bc772-14d1-4448-a25c-3dba7619a9ac')
    .order('called_at', { ascending: false });

  if (error) console.error(error);
  else console.log('Found logs:', JSON.stringify(calls, null, 2));
}

check();
