const { createClient } = require('@supabase/supabase-js');

const url = "https://mknxjfviqavylvsxsigs.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbnhqZnZpcWF2eWx2c3hzaWdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjc5MSwiZXhwIjoyMDkwNjk4NzkxfQ.2L-LDcJRagQBNaUjMj6hDuKFxUFzY4Dt1OCKZMIzGoA";

const supabase = createClient(url, key);

async function checkTasks() {
    // 1. Get two delivered orders
    const { data: orders } = await supabase.from('orders').select('id, order_number, customer_id').eq('delivery_status', 'delivered').limit(2);
    if (!orders || orders.length < 2) { console.log('Not enough orders'); return; }

    console.log(`Attempting to insert task for Order ${orders[0].order_number}...`);
    const { error: err1 } = await supabase.from('tasks').insert({
        order_id: orders[0].id,
        customer_id: orders[0].customer_id,
        task_type: 'review',
        due_date: '2026-04-10',
        status: 'pending'
    });
    if (err1) console.error('Task 1 Error:', err1);
    else console.log('Task 1 SUCCESS');

    console.log(`Attempting to insert task for Order ${orders[1].order_number}...`);
    const { error: err2 } = await supabase.from('tasks').insert({
        order_id: orders[1].id,
        customer_id: orders[1].customer_id,
        task_type: 'review',
        due_date: '2026-04-10',
        status: 'pending'
    });
    if (err2) console.error('Task 2 Error:', err2);
    else console.log('Task 2 SUCCESS');
}

checkTasks();
