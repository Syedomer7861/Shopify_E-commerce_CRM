const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
const fetch = require('node-fetch');

dotenv.config({ path: path.join(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
  const custId = '423d9b5e-879c-4774-a325-dbf9022383c2'; // Durga Ram (Masked)
  const { data: cust } = await supabase.from('customers').select('*').eq('id', custId).single();
  
  console.log(`Processing ${cust.name} (${cust.phone})`);
  
  // Order ID
  let shopifyOrderId = cust.phone.split("_SR_")[1];
  console.log(`Shopify Order ID: ${shopifyOrderId}`);

  // Get Shopify
  const { data: settings } = await supabase.from('settings').select('*').eq('id', '00000000-0000-0000-0000-000000000000').single();
  const shopifyUrl = `https://${settings.shopify_store_domain}/admin/api/2024-04/orders.json?name=${encodeURIComponent(shopifyOrderId)}&status=any`;
  const sRes = await fetch(shopifyUrl, { headers: { 'X-Shopify-Access-Token': settings.shopify_access_token } });
  const sData = await sRes.json();
  
  let phone = null;
  if (sData.orders && sData.orders.length > 0) {
    phone = sData.orders[0].shipping_address?.phone || sData.orders[0].customer?.phone;
    if (phone) {
      phone = phone.toString().replace(/[^\d]/g, "");
      if (phone.startsWith("91") && phone.length > 10) phone = phone.slice(phone.length - 10);
    }
  }
  
  console.log(`Resolved phone: ${phone}`);

  if (phone && !phone.includes("x")) {
    const { data: existing } = await supabase.from('customers').select('id, name').eq('phone', phone).neq('id', custId).maybeSingle();
    console.log(`Existing found: ${existing ? existing.name + " (" + existing.id + ")" : "NONE"}`);
    
    if (existing) {
        console.log("Attempting merge...");
        const updateRes = await Promise.all([
          supabase.from("orders").update({ customer_id: existing.id }).eq("customer_id", custId),
          supabase.from("tasks").update({ customer_id: existing.id }).eq("customer_id", custId),
        ]);
        console.log("Update Res:", updateRes.map(r => r.error || "OK"));
        
        const deleteRes = await supabase.from("customers").delete().eq("id", custId);
        console.log("Delete Res:", deleteRes.error || "OK");
    }
  }
}

debug();
