const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://mknxjfviqavylvsxsigs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbnhqZnZpcWF2eWx2c3hzaWdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjc5MSwiZXhwIjoyMDkwNjk4NzkxfQ.2L-LDcJRagQBNaUjMj6hDuKFxUFzY4Dt1OCKZMIzGoA'
);

async function debugJoins() {
  console.log('--- Debugging Call Logs Joins ---');
  // Try to find the correct relationship name for customers
  const { data, error } = await supabase
    .from('call_logs')
    .select('*, customers(*)')
    .limit(1);

  if (error) {
    console.error('Call Logs Customer Join Error:', error);
  } else {
    console.log('Call Logs Customer Join Success!');
  }

  console.log('\n--- Debugging Tasks Joins ---');
  const { error: tErr } = await supabase
    .from('tasks')
    .select('id, customers(*)')
    .limit(1);
    
  if (tErr) console.error('Tasks Customer Join Error:', tErr);
  else console.log('Tasks Customer Join Success!');
}

debugJoins();
