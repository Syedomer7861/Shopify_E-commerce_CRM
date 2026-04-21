const fetch = require('node-fetch');

const domain = 'cureforeva.myshopify.com';
const client_id = '8c0b4b52a61a0224f494f33230c22002';
const client_secret = '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';

async function testManualRefresh() {
    console.log(`Attempting refresh for ${domain}...`);
    
    // Prepare Grant Type (Matching the user's curl)
    const bodyParams = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: client_id,
        client_secret: client_secret
    });

    const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString()
    });

    if (response.ok) {
        const data = await response.json();
        console.log('SUCCESS! Obtained new token:', data.access_token);
        
        // Now test this new token
        console.log('Testing the new token with shop.json...');
        const shopRes = await fetch(`https://${domain}/admin/api/2024-04/shop.json`, {
            headers: { 'X-Shopify-Access-Token': data.access_token }
        });
        
        if (shopRes.ok) {
            const shopData = await shopRes.json();
            console.log('SHOP VERIFIED! Store Name:', shopData.shop.name);
        } else {
            console.error('New token worked for refresh but failed for shop.json with status:', shopRes.status);
        }

    } else {
        const errText = await response.text();
        console.error(`FAILURE! Status: ${response.status}`);
        console.error('Error Body:', errText);
    }
}

testManualRefresh();
