const fetch = require('node-fetch');

// CONFIG
const WEBHOOK_URL = 'http://localhost:3000/api/webhooks/shiprocket';
const SECRET = 'cureforever_shiprocket_sync_2026';

// This is Anand Jain's Cart ID which we are using as the Order ID
const ORDER_ID = '69d610352282b66c06d197e5'; 

const payload = {
    "awb": "TEST-AWB-101",
    "order_id": ORDER_ID,
    "status": "delivered",
    "status_code": "7",
    "delivered_date": new Date().toISOString(),
    "customer_phone": "9700541156",
    "customer_name": "Anand jain",
    "total": "975.0"
};

async function test() {
    console.log(`🚀 Simulating Delivery for Order: ${ORDER_ID}`);
    try {
        const res = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-shiprocket-secret': SECRET
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        console.log("✅ Result:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("❌ Failed:", e.message);
    }
}

test();
