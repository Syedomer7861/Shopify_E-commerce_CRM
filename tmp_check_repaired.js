
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function check() {
  const phones = ['9511661891', '7907022556', '9700784810'];
  for (const phone of phones) {
    const { data: carts } = await supabase
      .from('abandoned_carts')
      .select('*')
      .eq('phone', phone);
    
    if (carts) {
      carts.forEach(c => {
        const hasMeta = c.line_items.some(i => i.__metadata);
        console.log(`Phone: ${phone}, ID: ${c.id}, Has Meta: ${hasMeta}`);
        if (hasMeta) {
          const meta = c.line_items.find(i => i.__metadata);
          console.log(`Payload total: ${meta.payload.total_price || meta.payload.cart_value}`);
        }
      });
    }
  }
}
check();
