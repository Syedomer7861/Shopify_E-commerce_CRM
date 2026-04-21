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

async function testShipmentAPI() {
  const { data: settings } = await supabase.from('settings').select('*').limit(1).single();
  
  const authRes = await fetch(`${SHIPROCKET_BASE_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: settings.shiprocket_email.trim(), password: settings.shiprocket_password.trim() })
  });
  const { token } = await authRes.json();

  const srOrderId = "1236991707"; // For channel 17543
  
  console.log(`Fetching Shipments for SR Order ID: ${srOrderId}`);
  const shipRes = await fetch(
    `${SHIPROCKET_BASE_URL}/shipments?order_id=${srOrderId}`,
    { headers: { "Authorization": `Bearer ${token}` } }
  );
  const data = await shipRes.json();
  console.log("Shipment Response:", JSON.stringify(data, null, 2));
}

testShipmentAPI();
