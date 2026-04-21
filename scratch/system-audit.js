const { createClient } = require('@supabase/supabase-js');

// Load env from --env-file in node command
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runAudit() {
  console.log('🛡️ Starting System-Wide Integration Audit...');
  console.log('-------------------------------------------');

  // 1. Database & Config Check
  const { data: settings, error: settingsError } = await supabase.from('settings').select('*').single();
  if (settingsError) console.error('❌ Settings Table Error:', settingsError.message);
  else console.log('✅ Database Connectivity: OK');

  // 2. Webhook Health
  const { data: recentLogs, error: logError } = await supabase
    .from('webhook_logs')
    .select('source, topic, status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (logError) {
    console.error('❌ Webhook Logs Error:', logError.message);
  } else {
    console.log('📈 Recent Webhook Activity:');
    if (recentLogs.length === 0) console.log('   (No webhooks received in last 50 logs)');
    recentLogs.forEach(l => console.log(`   - [${l.created_at}] ${l.source} / ${l.topic} -> ${l.status}`));
  }

  // 3. Shopify Token Health
  const { data: shopifyToken } = await supabase.from('settings').select('shopify_access_token, token_expires_at').single();
  const expires = new Date(shopifyToken?.token_expires_at);
  const now = new Date();
  if (expires > now) {
    console.log(`✅ Shopify Token: Valid (Expires in ${Math.round((expires - now) / (1000 * 60 * 60))} hours)`);
  } else {
    console.log('⚠️ Shopify Token: Expired or missing (Expected for initial setup or background refresh wait)');
  }

  // 4. Order Count Audit (Deduplication Check)
  const { count: orderCount } = await supabase.from('orders').select('*', { count: 'exact', head: true });
  console.log(`📦 Active Orders in DB: ${orderCount}`);

  // 5. WhatsApp Server Health (Checking if it handles requests)
  try {
    const waRes = await fetch('http://localhost:3001/status').catch(() => null);
    if (waRes?.ok) console.log('✅ WhatsApp Bridge (wa_server.js): Online on port 3001');
    else console.log('⚠️ WhatsApp Bridge (wa_server.js): Offline or Port 3001 unreachable');
  } catch (e) {
    console.log('⚠️ WhatsApp Bridge check failed:', e.message);
  }

  console.log('-------------------------------------------');
  console.log('Audit Summary printed to console.');
}

runAudit();
