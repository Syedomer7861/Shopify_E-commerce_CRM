// Task Repair Script
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function repairTasks() {
    console.log("🛠️ Starting Task Repair for Abandoned Carts...");
    
    try {
        const { data: carts } = await supabase.from('abandoned_carts')
            .select('*, customers(total_orders, rto_flag)')
            .eq('recovery_status', 'pending')
            .neq('phone', 'unknown');

        if (!carts || carts.length === 0) {
            console.log("✅ No pending recoverable carts found without tasks.");
            return;
        }

        console.log(`🔍 Found ${carts.length} carts needing tasks. Assigning...`);
        
        const { data: agents } = await supabase.from('profiles').select('id').eq('role', 'agent');
        const defaultOwner = agents?.[0]?.id;

        for (const cart of carts) {
            const recoveryDate = new Date(cart.abandoned_at);
            recoveryDate.setHours(recoveryDate.getHours() + 1);

            let score = 50;
            if (cart.total_price > 2000) score += 20;
            if (cart.customers?.total_orders > 0) score += 15;
            if (cart.customers?.rto_flag) score -= 30;

            await supabase.from('tasks').upsert({
                abandoned_cart_id: cart.id,
                customer_id: cart.customer_id,
                task_type: 'recovery',
                due_date: recoveryDate.toISOString().split('T')[0],
                status: 'pending',
                assigned_to: defaultOwner,
                priority_score: Math.max(0, Math.min(100, score))
            }, { onConflict: 'abandoned_cart_id, task_type' });
        }

        console.log(`✅ Successfully generated ${carts.length} recovery tasks.`);
        process.exit(0);
    } catch (err) {
        console.error("❌ Repair Failed:", err);
        process.exit(1);
    }
}

repairTasks();
