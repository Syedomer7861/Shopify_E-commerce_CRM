const { createClient } = require('@supabase/supabase-js');
const { getShopifyAccessToken } = require('../src/lib/server-settings');

// Mock a minimal environment for the script
const SUPABASE_URL = 'https://mknxjfviqavylvsxsigs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbnhqZnZpcWF2eWx2c3hzaWdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjc5MSwiZXhwIjoyMDkwNjk4NzkxfQ.2L-LDcJRagQBNaUjMj6hDuKFxUFzY4Dt1OCKZMIzGoA';

async function testAutoRefresh() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    try {
        console.log('Attempting internal token refresh...');
        const token = await getShopifyAccessToken(supabase);
        console.log('SUCCESS! Internal refresh obtained token:', token.slice(0, 10) + '...');
    } catch (err) {
        console.error('FAILURE! Internal refresh failed:', err.message);
    }
}

testAutoRefresh();
