const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

async function massHeal() {
  console.log('🌊 Starting High-Visibility History Healing...');
  
  if (!fs.existsSync('.env')) {
      console.error('❌ .env file not found.');
      return;
  }
  const env = fs.readFileSync('.env', 'utf8');
  const urlRegex = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
  const keyRegex = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
  
  if (!urlRegex || !keyRegex) {
      console.error('❌ Supabase credentials missing in .env');
      return;
  }
  
  const url = urlRegex[1].trim();
  const key = keyRegex[1].trim();
  const supabase = createClient(url, key);

  const { data: settings } = await supabase.from("settings").select("*").eq("id", "00000000-0000-0000-0000-000000000000").single();
  const shopifyToken = settings?.shopify_api_key;
  const shopifyDomain = settings?.shopify_store_domain;

  if (!shopifyToken || !shopifyDomain) {
      console.error('❌ Shopify credentials missing in settings.');
      return;
  }

  let totalHealed = 0;
  let totalMerged = 0;
  let batchNum = 1;

  while (true) {
    process.stdout.write(`\n🔍 PROCESSING BATCH #${batchNum} (Healed: ${totalHealed})...\n`);
    
    // Find customers with "x" in phone
    const { data: customers } = await supabase
      .from("customers")
      .select("id, phone, name, email")
      .or('phone.ilike.%x%,phone.ilike.%_SR_%')
      .limit(50);

    if (!customers || customers.length === 0) {
      console.log('✨ MISSION ACCOMPLISHED: Database is 100% unmasked!');
      break;
    }

    for (const cust of customers) {
      try {
        const { data: order } = await supabase
          .from("orders")
          .select("shopify_order_id, order_number")
          .eq("customer_id", cust.id)
          .order("ordered_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const idToTry = order?.shopify_order_id || order?.order_number;
        if (!idToTry) {
            // Cannot heal — mark to ignore in this loop
            await supabase.from("customers").update({ last_order_date: new Date().toISOString() }).eq("id", cust.id);
            process.stdout.write('◦'); // Skip marker
            continue;
        }

        const domain = shopifyDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
        const res = await fetch(`https://${domain}/admin/api/2024-04/orders.json?name=${encodeURIComponent(idToTry)}&status=any`, {
          headers: { 'X-Shopify-Access-Token': shopifyToken }
        });
        const data = await res.json();
        
        let foundPhone = null;
        if (data.orders?.[0]) {
            const o = data.orders[0];
            const raw = o.shipping_address?.phone || o.customer?.phone || "";
            foundPhone = raw.toString().trim().replace(/[^\d]/g, "");
            if (foundPhone.startsWith("91") && foundPhone.length > 10) foundPhone = foundPhone.slice(-10);
        }

        if (foundPhone && foundPhone.length >= 10 && !foundPhone.includes('x')) {
          const { data: existing } = await supabase.from("customers").select("id").eq("phone", foundPhone).neq("id", cust.id).maybeSingle();
          if (existing) {
              await Promise.all([
                supabase.from("orders").update({ customer_id: existing.id }).eq("customer_id", cust.id),
                supabase.from("tasks").update({ customer_id: existing.id }).eq("customer_id", cust.id),
                supabase.from("abandoned_carts").update({ customer_id: existing.id }).eq("customer_id", cust.id),
              ]);
              await supabase.from("customers").delete().eq("id", cust.id);
              totalMerged++;
              process.stdout.write('🤝'); // Merge marker
          } else {
              await supabase.from("customers").update({ phone: foundPhone }).eq("id", cust.id);
              process.stdout.write('🔓'); // Heal marker
          }
          totalHealed++;
        } else {
            await supabase.from("customers").update({ last_order_date: new Date().toISOString() }).eq("id", cust.id);
            process.stdout.write('•'); // Not found marker
        }
      } catch (e) {
        process.stdout.write('!'); // Error marker
      }
    }
    
    batchNum++;
    if (totalHealed > 1500) break;
  }

  console.log(`\n🎉 Final Results: Healed ${totalHealed}, Merged ${totalMerged}`);
}

massHeal();
