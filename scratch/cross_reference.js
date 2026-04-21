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

async function crossReference() {
  console.log("Searching for masked customers that can be resolved via other data...");

  // 1. Get masked customers
  const { data: masked } = await supabase
    .from('customers')
    .select('id, name, email, phone')
    .or('phone.ilike.%x%,phone.ilike.%_SR_%');

  if (!masked) return;
  console.log(`Analyzing ${masked.length} masked customers...`);

  let resolvableByEmail = 0;
  let resolvableByCart = 0;

  for (const cust of masked) {
      if (cust.email) {
          // Check for another customer with same email but unmasked phone
          const { data: others } = await supabase
            .from('customers')
            .select('phone')
            .eq('email', cust.email)
            .neq('id', cust.id)
            .not('phone', 'ilike', '%x%')
            .not('phone', 'ilike', '%_SR_%');
          
          if (others && others.length > 0) {
              resolvableByEmail++;
              // console.log(`  Match! ${cust.name} (${cust.email}) matches ${others[0].phone}`);
          }
      }

      // Check abandoned carts
      const { data: carts } = await supabase
        .from('abandoned_carts')
        .select('customer_phone')
        .eq('customer_id', cust.id)
        .not('customer_phone', 'ilike', '%x%');
      
      if (carts && carts.length > 0) {
          resolvableByCart++;
          // console.log(`  Cart Match! ${cust.name} has cart with ${carts[0].customer_phone}`);
      }
  }

  console.log(`\nResults:`);
  console.log(`Resolvable by Email matching: ${resolvableByEmail}`);
  console.log(`Resolvable by Abandoned Cart matching: ${resolvableByCart}`);
}

crossReference();
