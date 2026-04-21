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

async function findResolvableByLocalData() {
  console.log("Checking for masked customers that can be resolved via local abandonment or cross-record data...");

  // 1. Resolve via abandoned carts
  const { data: cartResolvable } = await supabase
    .from('abandoned_carts')
    .select('customer_id, phone, customers(name)')
    .not('phone', 'ilike', '%x%')
    .limit(10);
  
  if (cartResolvable) {
      console.log(`\nResolvable by Abandoned Carts (${cartResolvable.length} samples):`);
      cartResolvable.forEach(r => console.log(`- ${r.customers?.name}: ${r.phone}`));
  }

  // 2. Resolve via email match in customers table
  const { data: maskedWithEmail } = await supabase
    .from('customers')
    .select('id, name, email')
    .or('phone.ilike.%x%,phone.ilike.%_SR_%')
    .not('email', 'is', null)
    .limit(50);
  
  if (maskedWithEmail) {
      console.log(`\nResolvable by Email matching:`);
      for (const m of maskedWithEmail) {
          const { data: unmasked } = await supabase
            .from('customers')
            .select('phone')
            .eq('email', m.email)
            .not('phone', 'ilike', '%x%')
            .not('phone', 'ilike', '%_SR_%')
            .maybeSingle();
          if (unmasked) {
              console.log(`- ${m.name} (${m.email}) -> ${unmasked.phone}`);
          }
      }
  }
}

findResolvableByLocalData();
