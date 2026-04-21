const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually read .env
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const [key, ...vals] = trimmed.split('=');
  if (key && vals.length > 0) env[key.trim()] = vals.join('=').trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanup() {
  console.log("--- STARTING ORDER CLEANUP ---");
  
  let allOrders = [];
  let pageSize = 1000;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    console.log(`Fetching orders ${from} to ${from + pageSize - 1}...`);
    const { data: batch, error } = await supabase
      .from('orders')
      .select('id, shopify_order_id, order_number, tracking_number, delivery_status, updated_at')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("Failed to fetch orders:", error);
      break;
    }

    allOrders.push(...batch);
    if (batch.length < pageSize) hasMore = false;
    else from += pageSize;
  }

  console.log(`Processing ${allOrders.length} orders...`);

  const groups = new Map();
  allOrders.forEach(o => {
    // Identity consists of a normalized order number
    const key = String(o.order_number).replace('#', '').trim();
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });

  const idsToDelete = [];
  let duplicatesFound = 0;

  groups.forEach((items, key) => {
    if (items.length > 1) {
      duplicatesFound++;
      // Aggressive sorting: 
      // 1. Long numeric strings (GID)
      // 2. High completeness
      items.sort((a, b) => {
        const score = (o) => {
          let s = 0;
          const sid = String(o.shopify_order_id || "");
          // Correct Shopify GIDs are usually 13 digits (starts with 68, 67, etc.)
          if (sid.length >= 10 && /^\d+$/.test(sid)) s += 100;
          if (o.tracking_number) s += 20;
          if (o.delivery_status !== 'pending') s += 10;
          if (o.updated_at) s += new Date(o.updated_at).getTime() / 1e12;
          return s;
        };
        return score(b) - score(a);
      });

      const toDelete = items.slice(1).map(i => i.id);
      idsToDelete.push(...toDelete);
    }
  });

  console.log(`Found ${duplicatesFound} duplicated groups. Total records to delete: ${idsToDelete.length}`);

  if (idsToDelete.length > 0) {
    // Process deletes in batches of 100
    for (let i = 0; i < idsToDelete.length; i += 100) {
      const batch = idsToDelete.slice(i, i + 100);
      const { error: delError } = await supabase
        .from('orders')
        .delete()
        .in('id', batch);
      
      if (delError) {
        console.error(`Error deleting batch starting at ${i}:`, delError);
      } else {
        console.log(`Deleted batch ${i/100 + 1}...`);
      }
    }
    console.log("Cleanup complete!");
  } else {
    console.log("No duplicates found.");
  }
}

cleanup();
