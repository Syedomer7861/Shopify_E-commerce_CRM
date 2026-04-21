const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanup() {
  console.log("--- STARTING LIVE READINESS CLEANUP (REAL MODE) ---");

  // 1. DELETE TEST CUSTOMERS
  const { data: testCustomers } = await supabase.from('customers')
    .select('id, name, phone, email')
    .or('name.ilike.%test%,name.ilike.%fake%,name.ilike.%demo%,email.ilike.%test%,email.ilike.%example%');

  if (testCustomers && testCustomers.length > 0) {
    console.log(`Deleting ${testCustomers.length} test customers...`);
    const ids = testCustomers.map(c => c.id);
    // Delete related data first (tasks, orders will be cascade or handled)
    await supabase.from('tasks').delete().in('customer_id', ids);
    await supabase.from('call_logs').delete().in('customer_id', ids);
    const { error } = await supabase.from('customers').delete().in('id', ids);
    if (error) console.error("Error deleting customers:", error);
    else console.log("Success!");
  }

  // 2. MERGE PHONE DUPLICATES
  const { data: allCustomers } = await supabase.from('customers').select('id, phone, name');
  const phoneMap = new Map();
  const dupsToMerge = [];

  allCustomers?.forEach(c => {
    const normalized = c.phone.startsWith('91') && c.phone.length > 10 ? c.phone.slice(c.phone.length - 10) : c.phone;
    if (phoneMap.has(normalized)) {
      dupsToMerge.push({
        normalized,
        keep: phoneMap.get(normalized),
        remove: c
      });
    } else {
      phoneMap.set(normalized, c);
    }
  });

  for (const d of dupsToMerge) {
    console.log(`Merging ${d.remove.phone} into ${d.keep.phone}...`);
    // Move tasks
    await supabase.from('tasks').update({ customer_id: d.keep.id }).eq('customer_id', d.remove.id);
    // Move call logs
    await supabase.from('call_logs').update({ customer_id: d.keep.id }).eq('customer_id', d.remove.id);
    // Move orders
    await supabase.from('orders').update({ customer_id: d.keep.id }).eq('customer_id', d.remove.id);
    // Delete duplicate customer
    await supabase.from('customers').delete().eq('id', d.remove.id);
  }

  // 3. DELETE DUPLICATE ORDERS (Keep Shopify authority)
  const { data: allOrders } = await supabase.from('orders').select('id, order_number, shopify_order_id, source');
  const orderMap = new Map();
  const orderDupsToDelete = [];

  allOrders?.forEach(o => {
    if (orderMap.has(o.order_number)) {
      const prev = orderMap.get(o.order_number);
      // If one is from shopify and other is not, keep shopify
      if (o.source === 'shopify' && prev.source !== 'shopify') {
        orderDupsToDelete.push(prev.id);
        orderMap.set(o.order_number, o);
      } else {
        orderDupsToDelete.push(o.id);
      }
    } else {
      orderMap.set(o.order_number, o);
    }
  });

  if (orderDupsToDelete.length > 0) {
    console.log(`Deleting ${orderDupsToDelete.length} duplicate orders...`);
    await supabase.from('tasks').delete().in('order_id', orderDupsToDelete);
    const { error } = await supabase.from('orders').delete().in('id', orderDupsToDelete);
    if (error) console.error("Error deleting orders:", error);
    else console.log("Success!");
  }

  console.log("\n--- CLEANUP COMPLETE ---");
}

cleanup();
