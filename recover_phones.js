const fs = require('fs');

async function run() {
  const envFile = fs.readFileSync('.env', 'utf8');
  envFile.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val) process.env[key.trim()] = val.join('=').trim().replace(/['"]/g, '');
  });

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: logs } = await supabase.from('webhook_logs').select('payload').not('payload', 'is', null);
  let recovered = 0;
  
  for (const log of logs) {
      if (!log.payload) continue;
      
      const payload = log.payload;
      const data = payload.data || payload.payload || payload;
      
      const phoneRaw = data.mobile || data.phone || data.customer_phone || data.phone_number || data.shipping_address?.phone || data.billing_address?.phone;
      if (!phoneRaw) continue;
      
      const phone = String(phoneRaw).trim().replace(/^\+/, "").replace(/^91/, "").replace(/\s/g, "");
      if (!phone || phone.includes('x') || phone.includes('X') || phone.includes('*')) continue;
      
      const orderId = data.order_id || data.channel_order_id || data.shiprocket_order_id || data.checkout_order_id || data.order_number || data.id;
      const email = data.email || data.customer_email || data.shipping_address?.email || data.billing_address?.email;
      
      // Let's check if there is a customer with an empty/masked phone where email or order_id matches
      if (orderId) {
          const { data: order } = await supabase.from('orders').select('customer_id').eq('shopify_order_id', String(orderId)).maybeSingle();
          if (order && order.customer_id) {
              const { data: customer } = await supabase.from('customers').select('id, phone').eq('id', order.customer_id).single();
              if (customer && (customer.phone.includes('x') || customer.phone.includes('_SR_'))) {
                  console.log(`Recovered phone for order ${orderId}: ${phone}`);
                  recovered++;
                  await supabase.from('customers').update({ phone: phone }).eq('id', customer.id);
              }
          }
      }
  }
  console.log(`Total recovered from webhooks: ${recovered}`);
}
run();
