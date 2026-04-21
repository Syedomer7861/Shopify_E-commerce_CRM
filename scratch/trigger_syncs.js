const fetch = require('node-fetch');

async function triggerSyncs() {
    console.log('Triggering Shopify Sync (Abandoned Carts & Orders)...');
    try {
        const shopifyRes = await fetch('http://localhost:3000/api/sync/shopify', { method: 'POST' });
        const shopifyData = await shopifyRes.json();
        console.log('Shopify Sync Results:', JSON.stringify(shopifyData, null, 2));
    } catch (err) {
        console.error('Shopify Sync Trigger Failed:', err.message);
    }

    console.log('\nTriggering Shiprocket Sync (Delivery Statuses)...');
    try {
        const srRes = await fetch('http://localhost:3000/api/sync/shiprocket', { method: 'POST' });
        const srData = await srRes.json();
        console.log('Shiprocket Sync Results:', JSON.stringify(srData, null, 2));
    } catch (err) {
        console.error('Shiprocket Sync Trigger Failed:', err.message);
    }
}

triggerSyncs();
