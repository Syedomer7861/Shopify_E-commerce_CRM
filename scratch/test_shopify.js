const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const SUPABASE_URL = 'https://mknxjfviqavylvsxsigs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbnhqZnZpcWF2eWx2c3hzaWdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjc5MSwiZXhwIjoyMDkwNjk4NzkxfQ.2L-LDcJRagQBNaUjMj6hDuKFxUFzY4Dt1OCKZMIzGoA';

async function testConnection() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // 1. Fetch settings from DB
    const { data: settings, error } = await supabase.from('settings').select('*').limit(1).single();
    if (error) {
        console.error('Error fetching settings:', error);
        return;
    }

    console.log('Settings fetched. Domain:', settings.shopify_store_domain);
    
    // 2. Test Shopify API with shopify_access_token
    const token = settings.shopify_access_token;
    const domain = settings.shopify_store_domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    
    console.log(`Testing connection to ${domain} with token ending in ${token.slice(-5)}...`);
    
    const response = await fetch(`https://${domain}/admin/api/2024-04/shop.json`, {
        headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json'
        }
    });

    if (response.ok) {
        const data = await response.json();
        console.log('SUCCESS! Connected to Shop:', data.shop.name);
    } else {
        const errText = await response.text();
        console.error(`FAILURE! Status: ${response.status}`);
        console.error('Error Body:', errText);
    }
}

testConnection();
