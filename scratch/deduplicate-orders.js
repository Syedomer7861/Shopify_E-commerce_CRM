const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function nuclearDeduplication() {
  console.log('☢️ STARTING NUCLEAR DEDUPLICATION...');
  
  // 1. Get all duplicates by order_number
  const { data: duplicates } = await supabase.rpc('get_duplicate_order_numbers'); 
  // If rpc doesn't exist, we fallback to manual grouping
  
  console.log('Fetching all order numbers to identify duplicates...');
  const { data: allOrders } = await supabase.from('orders').select('id, order_number, shopify_order_id, delivery_status, source, created_at');
  
  const groups = {};
  allOrders.forEach(o => {
    const num = o.order_number;
    if (!groups[num]) groups[num] = [];
    groups[num].push(o);
  });

  const duplicateGroups = Object.keys(groups).filter(num => groups[num].length > 1);
  console.log(`Found ${duplicateGroups.length} duplicate groups.`);

  for (const num of duplicateGroups) {
    const records = groups[num];
    console.log(`\nProcessing Order #${num} (${records.length} variants)`);
    
    // Sort logic: 
    // 1. Prefer those with a real 13-digit shopifyId
    // 2. Prefer those with Delivered status
    // 3. Prefer older (likely the original)
    const sorted = records.sort((a,b) => {
        const aIsReal = (a.shopify_order_id || "").length > 10;
        const bIsReal = (b.shopify_order_id || "").length > 10;
        if (aIsReal && !bIsReal) return -1;
        if (!aIsReal && bIsReal) return 1;
        
        const statusPriority = { delivered: 0, rto: 1, in_transit: 2, out_for_delivery: 3, pending: 4 };
        const pA = statusPriority[a.delivery_status] ?? 5;
        const pB = statusPriority[b.delivery_status] ?? 5;
        if (pA !== pB) return pA - pB;

        return new Date(a.created_at) - new Date(b.created_at);
    });

    const master = sorted[0];
    const toDelete = sorted.slice(1);

    console.log(`- KEEPING: ${master.id} (Status: ${master.status}, Mode: ${master.shopify_order_id})`);
    
    for (const d of toDelete) {
        console.log(`- DELETING Duplicate: ${d.id} (Status: ${d.delivery_status}, ID: ${d.shopify_order_id})`);
        
        // Before deleting, if the duplicate had information the master didn't, we'd update master here.
        // But for now, we just purge the clones.
        const { error } = await supabase.from('orders').delete().eq('id', d.id);
        if (error) console.error(`  ❌ Error deleting ${d.id}:`, error.message);
    }
  }

  console.log('\n✅ Nuclear Deduplication Complete.');
}

nuclearDeduplication();
