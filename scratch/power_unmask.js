const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Logic import equivalent
const envFile = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function isMasked(phone) {
  return phone.includes("x") || phone.includes("X") || phone.includes("*");
}

function find10DigitPhone(str) {
  const matches = str.match(/(?:(?:\+|91)?)?\b([6-9]\d{9})\b/g);
  if (matches) {
      for (const m of matches) {
          const c = m.replace(/[^\d]/g, "");
          const clean = c.length > 10 ? c.slice(c.length - 10) : c;
          if (!['8008313180', '7907022556'].includes(clean)) return clean;
      }
  }
  return null;
}

async function powerUnmask() {
  console.log("🚀 Starting Power Unmasking Process...");

  // 1. Get all masked customers
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, email, phone')
    .or('phone.ilike.%x%,phone.ilike.%_SR_%');

  if (!customers || customers.length === 0) {
    console.log("✅ No masked customers found.");
    return;
  }

  console.log(`🔍 Analyzing ${customers.length} masked customers...`);

  let resolved = 0;

  for (const cust of customers) {
    let newPhone = null;

    // A. Check Email match in unmasked records
    if (cust.email && cust.email !== 'noreply@shiprocket.com') {
        const { data: other } = await supabase
            .from('customers')
            .select('phone')
            .eq('email', cust.email)
            .not('phone', 'ilike', '%x%')
            .not('phone', 'ilike', '%_SR_%')
            .limit(1)
            .maybeSingle();
        if (other?.phone) newPhone = other.phone;
    }

    // B. Check Abandoned Carts
    if (!newPhone) {
        const { data: cart } = await supabase
            .from('abandoned_carts')
            .select('phone')
            .eq('customer_id', cust.id)
            .not('phone', 'ilike', '%x%')
            .limit(1)
            .maybeSingle();
        if (cart?.phone) newPhone = cart.phone;
    }

    // C. Check Webhook Logs for deep mining
    if (!newPhone) {
        // Find an order ID first
        const { data: order } = await supabase
            .from('orders')
            .select('shopify_order_id')
            .eq('customer_id', cust.id)
            .limit(1)
            .maybeSingle();
        
        if (order?.shopify_order_id) {
            const { data: logs } = await supabase
                .from('webhook_logs')
                .select('payload')
                .or(`payload->>order_id.eq.${order.shopify_order_id},payload->>channel_order_id.eq.${order.shopify_order_id}`)
                .limit(5);
            
            if (logs) {
                for (const log of logs) {
                    const found = find10DigitPhone(JSON.stringify(log.payload));
                    if (found) { newPhone = found; break; }
                }
            }
        }
    }

    if (newPhone && !isMasked(newPhone)) {
        console.log(`✅ Resolved ${cust.name}: ${newPhone}`);
        await supabase.from('customers').update({ phone: newPhone }).eq('id', cust.id);
        resolved++;
    }
  }

  console.log(`\n🎉 Process Complete! Resolved ${resolved} out of ${customers.length} masked records.`);
}

powerUnmask();
