const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually read .env
try {
  const envPath = path.resolve(process.cwd(), '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...vals] = trimmed.split('=');
    if (key && vals.length > 0) env[key.trim()] = vals.join('=').trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  });

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing keys in .env. Found:", Object.keys(env));
      process.exit(1);
  }

  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  async function run() {
    console.log("--- ORDER STATUS & INTEGRITY AUDIT ---");
    
    // 1. Check for Pending orders that have Tracking Numbers
    // (These SHOULD be in_transit or delivered if Shiprocket sync is working)
    const { data: misaligned, error } = await supabase
      .from('orders')
      .select('order_number, delivery_status, tracking_number, source')
      .not('tracking_number', 'is', null)
      .eq('delivery_status', 'pending');

    if (error) console.error("Error fetching misaligned:", error);
    else {
      console.log(`\nOrders with status 'pending' but HAVE tracking: ${misaligned.length}`);
      if (misaligned.length > 0) {
        console.log("Sample Misaligned (top 10):", misaligned.slice(0, 10).map(m => m.order_number).join(', '));
      }
    }

    // 2. Check for Orders with NO Customer linkage
    const { count: orphanCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .is('customer_id', null);
    
    console.log("\nOrphaned Orders (no customer_id):", orphanCount);

    // 3. Check for specific orders from user's duplicate list to ensure they are clean
    const specificNums = ['19373', '19372'];
    const { data: specificCheck } = await supabase
      .from('orders')
      .select('order_number, delivery_status, customer_id, customers(name)')
      .in('order_number', specificNums);
    
    console.log("\nSpecific Order Check (cleanup verification):");
    console.log(JSON.stringify(specificCheck, null, 2));

    const { count } = await supabase.from('orders').select('*', { count: 'exact', head: true });
    console.log("\nTotal Unique Orders in DB:", count);
  }

  run();
} catch (e) {
  console.error("Failed to start diag:", e.message);
}
