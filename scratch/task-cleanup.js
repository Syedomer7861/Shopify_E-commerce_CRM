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

async function cleanupTasks() {
  console.log("--- STARTING TASK CLEANUP ---");
  
  // 1. Fetch all tasks (paginated since there are > 1600)
  let allTasks = [];
  let from = 0;
  let pageSize = 1000;
  let hasMore = true;

  while(hasMore) {
    console.log(`Fetching tasks ${from} to ${from + pageSize - 1}...`);
    const { data, error } = await supabase
      .from('tasks')
      .select('id, task_type, customer_id, order_id, abandoned_cart_id, status, created_at')
      .range(from, from + pageSize - 1);
    
    if (error) { console.error("Fetch Error:", error); break; }
    allTasks.push(...data);
    if (data.length < pageSize) hasMore = false;
    else from += pageSize;
  }

  console.log(`Scanning ${allTasks.length} tasks for duplicates...`);

  // 2. Identify Duplicates
  const tracker = new Map();
  const idsToDelete = [];

  allTasks.forEach(t => {
    // Unique key: type + customer + (order OR cart)
    const refId = t.order_id || t.abandoned_cart_id || 'no-ref';
    const key = `${t.task_type}-${t.customer_id}-${refId}`;

    if (tracker.has(key)) {
      const existing = tracker.get(key);
      // Keep the most recent one (or could keep the one with a completed status, 
      // but usually pending ones are the duplicates)
      if (new Date(t.created_at) > new Date(existing.created_at)) {
        idsToDelete.push(existing.id);
        tracker.set(key, t);
      } else {
        idsToDelete.push(t.id);
      }
    } else {
      tracker.set(key, t);
    }
  });

  console.log(`Found ${idsToDelete.length} redundant tasks.`);

  // 3. Find Orphans (pointing to deleted orders)
  const orderIdsInTasks = [...new Set(allTasks.map(t => t.order_id).filter(Boolean))];
  console.log(`Checking ${orderIdsInTasks.length} referenced orders for existence...`);
  
  let validOrderIds = new Set();
  for (let i = 0; i < orderIdsInTasks.length; i += 500) {
      const { data: realOrders } = await supabase
        .from('orders')
        .select('id')
        .in('id', orderIdsInTasks.slice(i, i + 500));
      if (realOrders) realOrders.forEach(o => validOrderIds.add(o.id));
  }

  const orphans = allTasks.filter(t => t.order_id && !validOrderIds.has(t.order_id));
  console.log(`Found ${orphans.length} orphaned tasks (pointing to deleted orders).`);
  
  orphans.forEach(o => {
      if (!idsToDelete.includes(o.id)) idsToDelete.push(o.id);
  });

  // 4. Delete in batches
  if (idsToDelete.length > 0) {
    console.log(`Total tasks to delete: ${idsToDelete.length}`);
    for (let i = 0; i < idsToDelete.length; i += 100) {
        const batch = idsToDelete.slice(i, i + 100);
        await supabase.from('tasks').delete().in('id', batch);
        console.log(`Deleted batch starting ${i}...`);
    }
    console.log("Task cleanup complete!");
  } else {
    console.log("No duplicates or orphans found.");
  }
}

cleanupTasks();
