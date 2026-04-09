
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: logs, error } = await supabase
    .from('webhook_logs')
    .select('*')
    .eq('source', 'shiprocket')
    .limit(10);
    
  if (error) console.error(error);
  else console.log(JSON.stringify(logs, null, 2));

  const { data: carts } = await supabase
    .from('abandoned_carts')
    .select('*, customers(phone, name)')
    .limit(5);
  console.log('--- CARTS ---');
  console.log(JSON.stringify(carts, null, 2));
}

check();
