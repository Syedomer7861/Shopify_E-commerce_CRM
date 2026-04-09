
const { createClient } = require('@supabase/supabase-js');

const NEXT_PUBLIC_SUPABASE_URL = "https://mknxjfviqavylvsxsigs.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbnhqZnZpcWF2eWx2c3hzaWdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjc5MSwiZXhwIjoyMDkwNjk4NzkxfQ.2L-LDcJRagQBNaUjMj6hDuKFxUFzY4Dt1OCKZMIzGoA";

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testRecovery() {
    console.log('--- TESTING RECOVERY LOGIC ---');
    
    // 1. Get Settings
    const { data: settings } = await supabase.from('settings').select('*').single();
    const delayHours = settings.recovery_delay_hours || 24;
    const thresholdDate = new Date(Date.now() - (delayHours * 60 * 60 * 1000)).toISOString();
    
    console.log(`Threshold Date: ${thresholdDate} (Delay: ${delayHours}h)`);

    // 2. Query Tasks
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select(`
        id,
        task_type,
        due_date,
        status,
        created_at,
        customer:customers (
          id,
          name,
          phone,
          whatsapp_reminders_enabled,
          custom_meta
        ),
        abandoned_cart:abandoned_carts (
          cart_token,
          line_items
        )
      `)
      .eq("task_type", "recovery")
      .eq("status", "pending")
      .lte("created_at", thresholdDate);

    if (error) {
        console.error('Query Error:', error);
        return;
    }

    console.log(`Found ${tasks?.length || 0} tasks ready for recovery.`);
    
    if (tasks && tasks.length > 0) {
        tasks.forEach(task => {
            console.log(`- Task ${task.id} for ${task.customer?.name} (${task.customer?.phone})`);
            console.log(`  Created At: ${task.created_at}`);
        });
    } else {
        // Find WHY they are not found. Check all pending recovery tasks.
        const { data: allPending } = await supabase
            .from('tasks')
            .select('id, created_at, status')
            .eq('task_type', 'recovery')
            .eq('status', 'pending');
            
        console.log(`Total Pending Recovery Tasks: ${allPending?.length || 0}`);
        if (allPending) {
            allPending.forEach(t => {
                console.log(`  Task ${t.id} - Created: ${t.created_at}`);
            });
        }
    }
}

testRecovery();
