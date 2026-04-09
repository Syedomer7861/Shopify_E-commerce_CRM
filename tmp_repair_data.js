
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function repair() {
  const ids = ['201576fc-52cc-400a-8bab-7f278fa0d212', 'cfebca9e-0fe8-4ed0-9cbb-322cab607179', 'b0a01ba1-7f7a-4583-ac89-3f0835efddf0'];
  for (const id of ids) {
    const { data: cart } = await supabase.from('abandoned_carts').select('*, webhook_logs(*)').eq('id', id).maybeSingle();
    if (cart) {
      // Find the log that matches the phone
      const { data: logs } = await supabase.from('webhook_logs').select('*').ilike('payload::text', `%${cart.phone}%`).order('created_at', { ascending: false }).limit(1);
      if (logs && logs.length > 0) {
        const body = logs[0].payload;
        const enrichedItems = [
          ...(body.items || body.line_items || []),
          { __metadata: true, payload: body }
        ];
        await supabase.from('abandoned_carts').update({ line_items: enrichedItems }).eq('id', id);
        console.log(`Repaired ${id} for phone ${cart.phone}`);
      }
    }
  }
}
repair();
