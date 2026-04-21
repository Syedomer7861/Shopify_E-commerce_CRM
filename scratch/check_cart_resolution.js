const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function findResolvable() {
  console.log("Checking for any masked customer that has an unmasked abandoned cart...");

  const { data: results, error } = await supabase
    .from('abandoned_carts')
    .select('customer_id, customer_phone, customers(name)')
    .not('customer_phone', 'ilike', '%x%')
    .limit(20);

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Found ${results.length} potentially resolvable records.`);
  results.forEach(r => {
      console.log(`Customer: ${r.customers?.name} | Phone in Cart: ${r.customer_phone}`);
  });
}

findResolvable();
