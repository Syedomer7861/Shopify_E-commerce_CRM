const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://mknxjfviqavylvsxsigs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbnhqZnZpcWF2eWx2c3hzaWdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjc5MSwiZXhwIjoyMDkwNjk4NzkxfQ.2L-LDcJRagQBNaUjMj6hDuKFxUFzY4Dt1OCKZMIzGoA'
);

async function debugComplexJoin() {
  console.log('--- Debugging Complex Join ---');
  // This is the EXACT query causing the 400
  const { data, count, error } = await supabase
    .from('call_logs')
    .select('*, customers(*), tasks(*, orders(*))', { count: 'exact' })
    .limit(1);

  if (error) {
    console.error('Call Logs Complex Join Error:', JSON.stringify(error, null, 2));
  } else {
    console.log('Success! Columns in call_logs:', Object.keys(data[0]));
    if (data[0].tasks) console.log('Tasks relation found.');
    if (data[0].customers) console.log('Customers relation found.');
  }

  console.log('\n--- Checking specific FK names ---');
  // Sometimes Supabase requires the FK column name if it's not the default
  const { error: e2 } = await supabase
    .from('call_logs')
    .select('*, tasks!call_logs_task_id_fkey(*)')
    .limit(1);
  if (e2) console.log('tasks!call_logs_task_id_fkey failed:', e2.message);
  else console.log('tasks!call_logs_task_id_fkey success!');
}

debugComplexJoin();
