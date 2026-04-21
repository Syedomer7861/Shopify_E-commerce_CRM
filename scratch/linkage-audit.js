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

async function runAudit() {
  console.log("--- DATA LINKAGE INTEGRITY AUDIT ---");
  
  // 1. Check for Orphaned Orders
  const { count: orphanCount, error: orphanError } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .is('customer_id', null);

  if (orphanError) console.error("Error checking orphans:", orphanError);
  console.log(`Orphaned Orders (no customer_id): ${orphanCount}`);

  // 2. Sample Linkage Check
  const { data: samples, error: sampleError } = await supabase
    .from('orders')
    .select('order_number, total_price, customer_id, customers(id, name, phone)')
    .order('ordered_at', { ascending: false })
    .limit(20);

  if (sampleError) console.error("Error fetching samples:", sampleError);
  else {
    console.log("\nSample Assignments (Latest 20):");
    samples.forEach(o => {
      const custName = o.customers ? o.customers.name : "ORPHAN";
      const custPhone = o.customers ? o.customers.phone : "N/A";
      console.log(`Order #${o.order_number}: ₹${o.total_price} -> Customer: ${custName} (${custPhone})`);
    });
  }

  // 3. Check for Duplicate Customers by Phone
  // This is where wrong assignments usually happen
  const { data: phoneGroups, error: phoneError } = await supabase
    .rpc('execute_sql', { sql: "SELECT phone, count(*) FROM customers GROUP BY phone HAVING count(*) > 1;" });

  if (!phoneError && phoneGroups) {
    console.log(`\nDuplicate Phones in Customer Table: ${phoneGroups.length}`);
  }

  // 4. Verify specific orders mentioned by user earlier
  const specific = ['19373', '19372', '19371'];
  const { data: specificCheck } = await supabase
    .from('orders')
    .select('order_number, customers(name, phone)')
    .in('order_number', specific);
    
  console.log("\nTarget Order Verification:");
  if (specificCheck) {
    specificCheck.forEach(o => {
      console.log(`Order #${o.order_number} is currently assigned to: ${o.customers?.name || 'ERROR'}`);
    });
  }

  const { count: totalOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true });
  console.log(`\nTotal Orders in Database: ${totalOrders}`);
}

runAudit().catch(console.error);
