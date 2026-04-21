const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://mknxjfviqavylvsxsigs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbnhqZnZpcWF2eWx2c3hzaWdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjc5MSwiZXhwIjoyMDkwNjk4NzkxfQ.2L-LDcJRagQBNaUjMj6hDuKFxUFzY4Dt1OCKZMIzGoA'
);

async function discoverOutcomes() {
  const outcomes = ['done', 'rescheduled', 'cancelled', 'no_answer', 'interested', 'not_interested', 'wrong_number', 'busy', 'callback'];
  const results = {};

  console.log('--- Discovering Allowed Outcomes ---');
  for (const o of outcomes) {
    const { error } = await supabase.from('call_logs').insert({
        outcome: o,
        task_id: '00000000-0000-0000-0000-000000000001',
        customer_id: '00000000-0000-0000-0000-000000000001',
        agent_name: 'test'
    });

    if (error && error.message.includes('violates check constraint')) {
        results[o] = 'REJECTED';
    } else {
        results[o] = 'ALLOWED (or other error)';
        // cleanup if it actually inserted
        await supabase.from('call_logs').delete().eq('outcome', o).eq('agent_name', 'test');
    }
  }
  console.log(JSON.stringify(results, null, 2));
}

discoverOutcomes();
