
const { createClient } = require('@supabase/supabase-js');

const NEXT_PUBLIC_SUPABASE_URL = "https://mknxjfviqavylvsxsigs.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbnhqZnZpcWF2eWx2c3hzaWdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjc5MSwiZXhwIjoyMDkwNjk4NzkxfQ.2L-LDcJRagQBNaUjMj6hDuKFxUFzY4Dt1OCKZMIzGoA";

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkData() {
    console.log('--- CHECKING PENDING TASKS ---');
    const { data: tasks, error } = await supabase
        .from('tasks')
        .select(`
            id,
            task_type,
            status,
            due_date,
            created_at,
            abandoned_cart:abandoned_carts (
                id,
                line_items,
                custom_meta
            ),
            order:orders (
                id,
                line_items
            )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error fetching tasks:', error);
        return;
    }

    tasks.forEach(task => {
        console.log(`\nTask ID: ${task.id} | Type: ${task.task_type} | Status: ${task.status} | Due: ${task.due_date}`);
        const lineItems = task.order?.line_items || task.abandoned_cart?.line_items || [];
        console.log(`  Line Items Count: ${lineItems.length}`);
        if (lineItems.length > 0) {
            console.log(`  First 2 Items:`, JSON.stringify(lineItems.slice(0, 2), null, 2));
        }
        if (task.abandoned_cart?.custom_meta) {
            console.log(`  Custom Meta keys:`, Object.keys(task.abandoned_cart.custom_meta));
        }
    });

    console.log('\n--- CHECKING SETTINGS ---');
    const { data: settings } = await supabase.from('settings').select('*').limit(1).maybeSingle();
    console.log('Settings:', JSON.stringify(settings, null, 2));
}

checkData();
