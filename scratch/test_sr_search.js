const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

async function testSearchAPI() {
  const { data: settings } = await supabase.from('settings').select('*').limit(1).single();
  
  const authRes = await fetch(`${SHIPROCKET_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: settings.shiprocket_email.trim(), password: settings.shiprocket_password.trim() })
  });
  const { token } = await authRes.json();

  const channelId = "17543";
  console.log(`Searching for Channel Order ID: ${channelId}`);

  const searchRes = await fetch(
    `${SHIPROCKET_BASE_URL}/orders?filter_by=channel_order_id&filter=${channelId}`,
    {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
    }
  );
  
  const data = await searchRes.json();
  console.log("Search Result Keys:", Object.keys(data));
  if (data.data) {
    console.log("Orders found:", data.data.length);
    if (data.data.length > 0) {
        const sr = data.data[0];
        console.log("ID:", sr.id);
        console.log("Customer Phone (Search API):", sr.customer_phone || sr.billing_phone || sr.shipping_phone);
        
        // Try detail view
        console.log("\nFetching Detail View...");
        const detailRes = await fetch(
            `${SHIPROCKET_BASE_URL}/orders/show/${sr.id}`,
            {
                method: "GET",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
            }
        );
        const detail = await detailRes.json();
        const d = detail.data || detail;
        console.log("Customer Phone (Detail API):", d.customer_phone || d.billing_phone || d.shipping_phone);
    }
  } else {
    console.log("No data returned:", data);
  }
}

testSearchAPI();
