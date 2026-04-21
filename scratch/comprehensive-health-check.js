const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkIntegrations() {
  console.log('🕵️ COMPREHENSIVE INTEGRATION AUDIT');
  console.log('=================================');

  // 1. SUPABASE CONNECTION
  const { data: settings, error: sErr } = await supabase.from('settings').select('*').limit(1).single();
  if (sErr) console.error('❌ Supabase Connect: FAILED -', sErr.message);
  else console.log('✅ Supabase Connect: OK');

  // 2. SHOPIFY API HEALTH
  if (settings?.shopify_store_domain && settings?.shopify_api_key) {
    try {
        const domain = settings.shopify_store_domain.replace(/^https?:\/\//, "");
        // Test with current token or key
        const shopRes = await fetch(`https://${domain}/admin/api/2024-04/shop.json`, {
            headers: { "X-Shopify-Access-Token": settings.shopify_api_key }
        }).catch(() => null);

        if (shopRes?.ok) console.log('✅ Shopify API: CONNECTED');
        else if (shopRes?.status === 401) console.log('⚠️ Shopify API: UNAUTHORIZED (Token expired - Migration needed)');
        else console.log('❌ Shopify API: FAIL (Status ' + (shopRes?.status || 'Unknown') + ')');
    } catch (e) {
        console.log('❌ Shopify API Check Error:', e.message);
    }
  }

  // 3. SHIPROCKET API HEALTH
  if (settings?.shiprocket_email && settings?.shiprocket_password) {
    try {
        const srRes = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: settings.shiprocket_email, password: settings.shiprocket_password })
        }).catch(() => null);
        const srData = await srRes?.json();
        if (srData?.token) console.log('✅ Shiprocket API: CONNECTED');
        else console.log('❌ Shiprocket API: FAIL');
    } catch (e) {
        console.log('❌ Shiprocket API Error:', e.message);
    }
  }

  // 4. WHATSAPP BRIDGE
  try {
    const waRes = await fetch('http://localhost:3001/status').catch(() => null);
    if (waRes?.ok) console.log('✅ WhatsApp Bridge: ONLINE (3001)');
    else console.log('❌ WhatsApp Bridge: OFFLINE');
  } catch (e) {
    console.log('❌ WhatsApp Bridge check failed:', e.message);
  }

  // 5. WEBHOOK RECEPTION
  const { count: srHookCount } = await supabase
    .from('webhook_logs')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'shiprocket');
  
  console.log(`📈 Total Webhooks Recieved: ${srHookCount || 0}`);

  console.log('=================================');
  console.log('Audit Finished.');
}

checkIntegrations();
