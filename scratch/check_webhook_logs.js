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

async function checkWebhookLogs() {
  const channelOrderId = "17543";
  console.log(`Checking webhook logs for order: ${channelOrderId}`);

  const { data: logs, error } = await supabase
    .from('webhook_logs')
    .select('*')
    .or(`payload->>order_id.eq.${channelOrderId},payload->>channel_order_id.eq.${channelOrderId}`);

  if (error) {
    console.error("Error fetching logs:", error);
    return;
  }

  console.log(`Found ${logs.length} logs.`);
  logs.forEach(log => {
      const p = log.payload;
      console.log(`Log ID: ${log.id} | Event: ${log.event_type}`);
      // Find any phone fields
      const json = JSON.stringify(p);
      const phones = json.match(/\b([6-9]\d{9})\b/g);
      if (phones) {
          console.log("  Potential Unmasked Phones found in payload:", phones);
      } else {
          console.log("  No unmasked phone in this payload.");
      }
  });
}

checkWebhookLogs();
