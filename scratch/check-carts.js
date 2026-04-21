const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCarts() {
  const { data, error } = await supabase
    .from('abandoned_carts')
    .select('shopify_cart_id, cart_token, abandoned_at, source')
    .order('abandoned_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Recent Abandoned Carts in DB:');
  data.forEach(c => {
    console.log(`- ID: ${c.shopify_cart_id || c.cart_token}, At: ${c.abandoned_at}, Source: ${c.source}`);
  });
}

checkCarts();
