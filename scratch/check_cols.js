const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://mknxjfviqavylvsxsigs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbnhqZnZpcWF2eWx2c3hzaWdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjc5MSwiZXhwIjoyMDkwNjk4NzkxfQ.2L-LDcJRagQBNaUjMj6hDuKFxUFzY4Dt1OCKZMIzGoA'
);

async function checkCallLogsColumns() {
  console.log('--- Checking Call Logs Schema ---');
  const dummyId = '00000000-0000-0000-0000-000000000001';
  
  // Try to insert a dummy row to trigger column detection or just descriptive error
  const { data, error } = await supabase.from('call_logs').insert({
    task_id: dummyId,
    customer_id: dummyId,
    outcome: 'test',
    agent_name: 'test'
  }).select();

  if (error) {
    console.error('Insert Error:', error);
    if (error.message.includes('column')) {
        console.log('Detected columns from error message or context...');
    }
  } else {
    console.log('Insert Success! Columns detected:', Object.keys(data[0]));
    // Clean up
    await supabase.from('call_logs').delete().eq('id', data[0].id);
  }
}

checkCallLogsColumns();
