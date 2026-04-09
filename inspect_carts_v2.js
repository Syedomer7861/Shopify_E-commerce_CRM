
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const NEXT_PUBLIC_SUPABASE_URL = "https://mknxjfviqavylvsxsigs.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbnhqZnZpcWF2eWx2c3hzaWdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjc5MSwiZXhwIjoyMDkwNjk4NzkxfQ.2L-LDcJRagQBNaUjMj6hDuKFxUFzY4Dt1OCKZMIzGoA";

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function inspectCarts() {
    const prefixes = ['69d60d22', '69d60b37', '69d60c15'];
    let results = [];
    
    for (const prefix of prefixes) {
        const { data: carts } = await supabase
            .from('abandoned_carts')
            .select('*')
            .ilike('cart_token', `${prefix}%`);
            
        if (carts && carts.length > 0) {
            results.push(carts[0]);
        }
    }
    
    fs.writeFileSync('inspected_carts.json', JSON.stringify(results, null, 2));
    console.log(`Saved ${results.length} carts to inspected_carts.json`);
}

inspectCarts();
