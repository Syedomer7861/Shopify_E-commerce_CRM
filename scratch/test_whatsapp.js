const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://mknxjfviqavylvsxsigs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbnhqZnZpcWF2eWx2c3hzaWdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjc5MSwiZXhwIjoyMDkwNjk4NzkxfQ.2L-LDcJRagQBNaUjMj6hDuKFxUFzY4Dt1OCKZMIzGoA'
);

async function testWhatsapp() {
  const { error } = await supabase.from('call_logs').insert({
      outcome: 'whatsapp',
      task_id: '00000000-0000-0000-0000-000000000001',
      customer_id: '00000000-0000-0000-0000-000000000001',
      agent_name: 'test'
  });

  if (error) {
    console.log('REJECTED: ' + error.message);
  } else {
    console.log('ALLOWED');
    await supabase.from('call_logs').delete().eq('outcome', 'whatsapp').eq('agent_name', 'test');
  }
}

testWhatsapp();
