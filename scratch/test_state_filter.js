const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://mknxjfviqavylvsxsigs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbnhqZnZpcWF2eWx2c3hzaWdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjc5MSwiZXhwIjoyMDkwNjk4NzkxfQ.2L-LDcJRagQBNaUjMj6hDuKFxUFzY4Dt1OCKZMIzGoA'
);

async function testStateFilter() {
  console.log('--- Testing State Filter Query ---');
  const { data, error } = await supabase
    .from("orders")
    .select("*, customer:customers!inner(*)")
    .eq("customer.state", "Karnataka")
    .limit(1);

  if (error) {
    console.log('FAILED: ' + error.message);
    console.log('Code: ' + error.code);
    console.log('Details: ' + error.details);
  } else {
    console.log('SUCCESS: Found ' + data.length + ' orders');
  }
}

testStateFilter();
