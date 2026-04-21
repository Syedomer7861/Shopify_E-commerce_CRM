const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkWebhookLogs() {
  const { data, error } = await supabase
    .from('webhook_logs')
    .select('*')
    .eq('source', 'shiprocket')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Recent Webhook Logs from Shiprocket:');
  if (data.length === 0) {
    console.log('No logs found yet. Waiting for first event...');
  } else {
    data.forEach(log => {
      console.log(`- Time: ${log.created_at}, Topic: ${log.topic}, Status: ${log.status}`);
    });
  }
}

checkWebhookLogs();
