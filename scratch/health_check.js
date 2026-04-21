require('dotenv').config();

const tunnelUrl = 'http://localhost:3000';
const shiprocketToken = process.env.SHIPROCKET_WEBHOOK_TOKEN || 'cureforever_shiprocket_sync_2026';

async function testEndpoint(name, url, method, headers, payload) {
    try {
        console.log(`Testing ${name} (${url}) [${method}]...`);
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };
        if (method === 'POST') options.body = JSON.stringify(payload);
        
        const response = await fetch(url, options);
        
        console.log(`${name} Status:`, response.status);
        const text = await response.text();
        
        if (response.status >= 200 && response.status < 300) {
            console.log(`✅ ${name} is responding correctly.`);
            if (name === 'WhatsApp Status') {
                const data = JSON.parse(text);
                console.log(`   State: ${data.state}, Ready: ${data.ready}`);
            }
        } else if (name === 'Shopify Webhook' && response.status === 401) {
            console.log(`✅ ${name} is alive (Correctly rejected unauthorized request).`);
        } else {
            console.log(`❌ ${name} returned an error. Body:`, text.substring(0, 200));
        }
    } catch (e) {
        console.error(`❌ ${name} failed to connect:`, e.message);
    }
}

async function runAllTests() {
    console.log('--- STARTING FINAL HEALTH CHECK ---');
    
    // 1. Shiprocket Webhook
    await testEndpoint(
        'Shiprocket Webhook',
        `${tunnelUrl}/api/webhooks/shiprocket`,
        'POST',
        { 'x-shiprocket-secret': shiprocketToken },
        { status: 'Delivered', awb: 'TEST123', order_id: '123', status_code: '7' }
    );

    // 2. Shopify Webhook
    await testEndpoint(
        'Shopify Webhook',
        `${tunnelUrl}/api/webhooks/shopify`,
        'POST',
        { 'x-shopify-topic': 'orders/create', 'x-shopify-hmac-sha256': 'dummy' },
        { id: 123 }
    );

    // 3. WhatsApp Status Check
    await testEndpoint(
        'WhatsApp Status',
        `${tunnelUrl}/api/whatsapp/status`,
        'GET',
        {},
        {}
    );
    
    console.log('--- HEALTH CHECK COMPLETED ---');
}

runAllTests();
