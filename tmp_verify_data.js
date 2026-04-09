
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function verify() {
  console.log('--- TRIGGERING SYNC ---');
  // We can't easily "fetch" the local API from here without knowing the full URL, 
  // but we can just RE-RUN the logic from the sync route in a script!
  // However, it's easier to just check if existing records have been updated if I run a manual sync.
  
  // I'll just check the most recent abandoned carts to see if my enrichedItems logic worked.
  const { data: carts, error } = await supabase
    .from('abandoned_carts')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(5);
    
  if (error) {
    console.error(error);
    return;
  }

  console.log('--- RECENT CARTS ---');
  carts.forEach(c => {
    const hasMeta = c.line_items.some(i => i.__metadata);
    console.log(`ID: ${c.id}, Phone: ${c.phone}, Has Meta: ${hasMeta}`);
    if (hasMeta) {
      const meta = c.line_items.find(i => i.__metadata);
      console.log('Payload Snippet:', JSON.stringify(meta.payload).slice(0, 100) + '...');
    }
  });
}

verify();
