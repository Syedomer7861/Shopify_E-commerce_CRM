const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deepHistoricalSync() {
  console.log('🚀 STARTING DEEP HISTORICAL SYNC (5,000 ORDERS)...');
  
  // 1. Get Settings
  const { data: settings } = await supabase.from('settings').select('*').single();
  const domain = settings.shopify_store_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  
  // Use the new token from settings if available, else fallback to api_key
  const token = settings.shopify_access_token || settings.shopify_api_key;

  const headers = {
    "X-Shopify-Access-Token": token,
    "Content-Type": "application/json",
  };

  let url = `https://${domain}/admin/api/2024-04/orders.json?status=any&limit=250`;
  let totalProcessed = 0;
  let page = 1;

  while (url && page <= 20) {
    console.log(`\n📦 Fetching Page ${page}...`);
    const res = await fetch(url, { headers });
    const data = await res.json();
    const orders = data.orders || [];

    if (orders.length === 0) break;

    for (const order of orders) {
      try {
        const orderNumber = String(order.order_number || order.name);
        const shopifyId = String(order.id);
        
        // Find existing by EITHER id
        const { data: existing } = await supabase
            .from('orders')
            .select('id')
            .or(`shopify_order_id.eq.${shopifyId},order_number.eq.${orderNumber}`)
            .maybeSingle();

        const upsertData = {
          shopify_order_id: shopifyId,
          order_number: orderNumber,
          total_price: parseFloat(order.total_price),
          fulfillment_status: order.fulfillment_status || 'unfulfilled',
          delivery_status: order.fulfillment_status === 'fulfilled' ? 'delivered' : 'pending',
          ordered_at: order.created_at,
          source: 'shopify'
        };

        if (existing) {
          // If we found a duplicate or the same record, WE MUST USE THE DB ID
          await supabase.from('orders').update(upsertData).eq('id', existing.id);
        } else {
          // New order (shouldn't happen often in deep sync unless missing)
          // We need a customerId here, but for simple status sync we can skip if not found
          // Or we keep the existing upsert logic from sync-logic.ts
          // For this script, let's just update existing ones to fix their statuses
        }
        
        totalProcessed++;
        if (totalProcessed % 50 === 0) process.stdout.write('.');
      } catch (e) {
        console.error(`Error processing ${order.id}:`, e.message);
      }
    }

    const link = res.headers.get('Link');
    url = null;
    if (link) {
      const match = link.match(/<([^>]+)>;\s*rel="next"/);
      if (match) url = match[1];
    }
    page++;
  }

  console.log(`\n✅ Deep Sync Complete. Processed ${totalProcessed} orders.`);
}

deepHistoricalSync();
