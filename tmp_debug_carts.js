
const { createClient } = require('@supabase/supabase-js');

const NEXT_PUBLIC_SUPABASE_URL = "https://mknxjfviqavylvsxsigs.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbnhqZnZpcWF2eWx2c3hzaWdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjc5MSwiZXhwIjoyMDkwNjk4NzkxfQ.2L-LDcJRagQBNaUjMj6hDuKFxUFzY4Dt1OCKZMIzGoA";

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function debugSpecifics() {
    const IDs = ['69d60d22', '69d60b37', '69d60c15'];
    console.log('--- DEBUGGING SPECIFIC CARTS ---');
    
    for (const idPrefix of IDs) {
        const { data: carts } = await supabase
            .from('abandoned_carts')
            .select(`
                *,
                customer:customers (*)
            `)
            .ilike('cart_token', `${idPrefix}%`);
            
        if (carts && carts.length > 0) {
            const cart = carts[0];
            console.log(`\nCart Token: ${cart.cart_token}`);
            console.log(`Customer: ${cart.customer?.name} (${cart.customer?.phone})`);
            console.log(`Line Items:`, JSON.stringify(cart.line_items, null, 2));
        } else {
            console.log(`\nNo cart found for prefix: ${idPrefix}`);
        }
    }
}

debugSpecifics();
