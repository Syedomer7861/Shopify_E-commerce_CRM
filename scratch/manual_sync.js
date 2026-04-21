const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const SUPABASE_URL = 'https://mknxjfviqavylvsxsigs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbnhqZnZpcWF2eWx2c3hzaWdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjc5MSwiZXhwIjoyMDkwNjk4NzkxfQ.2L-LDcJRagQBNaUjMj6hDuKFxUFzY4Dt1OCKZMIzGoA';

async function manualSync() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: settings } = await supabase.from('settings').select('*').limit(1).single();
    
    const domain = settings.shopify_store_domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const token = settings.shopify_access_token;
    
    console.log('Starting manual sync for:', domain);

    const commonHeaders = {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
    };

    // 1. SYNC ABANDONED CHECKOUTS
    console.log('\n--- Syncing Abandoned Checkouts ---');
    const abRes = await fetch(`https://${domain}/admin/api/2024-04/checkouts.json?limit=50`, { headers: commonHeaders });
    const { checkouts } = await abRes.json();
    
    if (checkouts && checkouts.length > 0) {
        for (const cart of checkouts) {
            const phone = (cart.phone || cart.customer?.phone || cart.shipping_address?.phone || '').replace(/[^\d]/g, '');
            if (!phone) continue;

            const { data: cust } = await supabase.from('customers').upsert({
                phone: phone,
                name: `${cart.customer?.first_name || ''} ${cart.customer?.last_name || ''}`.trim() || 'Shopify Customer',
                email: cart.email,
                shopify_customer_id: cart.customer?.id?.toString()
            }, { onConflict: 'phone' }).select('id').single();

            if (cust) {
                await supabase.from('abandoned_carts').upsert({
                    customer_id: cust.id,
                    shopify_cart_id: String(cart.id),
                    cart_token: String(cart.token || cart.id),
                    phone: phone,
                    total_price: parseFloat(cart.total_price),
                    abandoned_at: cart.updated_at || cart.created_at,
                    recovery_status: 'pending'
                }, { onConflict: 'cart_token' });
                console.log(`Synced abandoned cart for ${phone}`);
            }
        }
    }

    // 2. SYNC RECENT ORDERS (FOR SHIPROCKET MAPPING)
    console.log('\n--- Syncing Recent Orders ---');
    const orderRes = await fetch(`https://${domain}/admin/api/2024-04/orders.json?status=any&limit=50`, { headers: commonHeaders });
    const { orders } = await orderRes.json();
    
    if (orders && orders.length > 0) {
        for (const order of orders) {
            const phone = (order.phone || order.customer?.phone || order.shipping_address?.phone || '').replace(/[^\d]/g, '');
            if (!phone) continue;

            const { data: cust } = await supabase.from('customers').upsert({
                phone: phone,
                name: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim() || 'Shopify Customer',
                email: order.email,
                shopify_customer_id: order.customer?.id?.toString()
            }, { onConflict: 'phone' }).select('id').single();

            if (cust) {
                await supabase.from('orders').upsert({
                    shopify_order_id: String(order.id),
                    order_number: String(order.order_number),
                    customer_id: cust.id,
                    total_price: parseFloat(order.total_price),
                    ordered_at: order.created_at,
                    fulfillment_status: order.fulfillment_status || 'unfulfilled'
                }, { onConflict: 'shopify_order_id' });
                 console.log(`Synced order #${order.order_number}`);
            }
        }
    }

    console.log('\nSync Complete!');
}

manualSync();
