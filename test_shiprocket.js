const fs = require('fs');

async function run() {
  const envFile = fs.readFileSync('.env', 'utf8');
  envFile.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val) process.env[key.trim()] = val.join('=').trim().replace(/['"]/g, '');
  });

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: settings } = await supabase
    .from("settings")
    .select("shiprocket_email, shiprocket_password")
    .eq("id", "00000000-0000-0000-0000-000000000000")
    .single();

  const authRes = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: settings.shiprocket_email.trim(), password: settings.shiprocket_password.trim() })
  });
  const { token } = await authRes.json();

  const orderData = await fetch(
    `https://apiv2.shiprocket.in/v1/external/orders?per_page=50&page=1`,
    { headers: { Authorization: `Bearer ${token}` }}
  ).then(r => r.json());

  console.log(`Sample checking first 5 orders from Shiprocket:`);
  for (const sr of orderData.data.slice(0, 5)) {
      const candidates = [
        sr.billing_phone,
        sr.shipping_phone,
        sr.customer_phone,
      ].filter(Boolean).map(p => String(p).trim().replace(/\\s/g, ""));
      
      const unmasked = candidates.find(p => !p.includes("x") && !p.includes("X") && !p.includes("*"));
      
      let finalPhone = null;
      if (unmasked) {
          let cleaned = unmasked.replace(/[^\\d]/g, "");
          if (cleaned.startsWith("91") && cleaned.length > 10) cleaned = cleaned.slice(2);
          if (cleaned.length === 10) finalPhone = cleaned;
          else finalPhone = cleaned;
      } else if (candidates.length > 0) {
          let cleaned = candidates[0].replace(/[^\\d]/g, "");
          if (cleaned.startsWith("91") && cleaned.length > 10) cleaned = cleaned.slice(2);
          finalPhone = cleaned;
      }
      console.log("- Order", sr.id, "candidates:", candidates, "-> finalPhone:", finalPhone);
  }
}
run().catch(console.error);
