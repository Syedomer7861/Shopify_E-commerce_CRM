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

async function inspectFullOrder() {
  const { data: settings } = await supabase.from('settings').select('*').limit(1).single();
  
  const authRes = await fetch(`${SHIPROCKET_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: settings.shiprocket_email.trim(), password: settings.shiprocket_password.trim() })
  });
  const { token } = await authRes.json();

  const srId = "1236991707"; // The SR ID found in previous step for channel 17543

  const detailRes = await fetch(
    `${SHIPROCKET_BASE_URL}/orders/show/${srId}`,
    {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
    }
  );
  const detail = await detailRes.json();
  console.log(JSON.stringify(detail, null, 2));
}

inspectFullOrder();
