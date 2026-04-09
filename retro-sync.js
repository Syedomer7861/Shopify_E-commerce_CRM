const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function retroSync() {
  console.log('🚀 Final Progressive Retro-Sync of Shiprocket Webhook Logs...');
  
  // 1. Get Credentials
  const env = fs.readFileSync('.env', 'utf8');
  const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
  const serviceRoleKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 2. Fetch unprocessed logs
  const { data: logs, error } = await supabase
    .from('webhook_logs')
    .select('*')
    .eq('source', 'shiprocket')
    .eq('status', 'received')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Error fetching logs:', error);
    return;
  }

  console.log(`📝 Found ${logs.length} unprocessed logs.`);

  for (const log of logs) {
    const body = log.payload;
    const cartId = body.cart_id || body.checkout_id;
    const orderId = body.order_id || body.channel_order_id;

    console.log(`⚙️ Processing log ID: ${log.id} (${cartId || orderId})`);

    try {
      // 🕵️ EXTRA ROBUST PHONE/EMAIL/NAME DETECTION
      const rawPhone = body.mobile || body.phone || 
                       body.customer_phone || 
                       body.shipping_address?.phone || 
                       body.billing_address?.phone || "";
      const customerPhone = rawPhone.toString().trim().replace(/^\+/, "").replace(/^91/, "").replace(/\s/g, "");
      
      const rawEmail = body.email || body.customer_email || 
                       body.shipping_address?.email || 
                       body.billing_address?.email || "";
      
      const firstName = body.first_name || body.shipping_address?.first_name || body.billing_address?.first_name || "";
      const lastName = body.last_name || body.shipping_address?.last_name || body.billing_address?.last_name || "";
      const fullName = body.customer_name || body.shipping_address?.name || body.billing_address?.name || 
                       (firstName ? `${firstName} ${lastName}`.trim() : "Shiprocket Customer");

      const productList = body.items || body.line_items || [];

      if (!customerPhone && !cartId) {
        console.warn('⚠️ Skipping: No phone or cart ID');
        continue;
      }

      // A1. Upsert Customer
      let customerId = null;
      if (customerPhone) {
        console.log(`   - Upserting Customer: ${customerPhone} (${fullName})`);
        const { data: customerData, error: custErr } = await supabase
          .from('customers')
          .upsert({
            name: fullName,
            phone: customerPhone,
            email: rawEmail || null,
            city: body.city || body.shipping_address?.city || body.billing_address?.city || null,
            state: body.state || body.shipping_address?.state || body.billing_address?.state || null,
            zip: body.pincode || body.shipping_address?.zip || body.billing_address?.zip || null,
            address: body.address || body.shipping_address?.address1 || body.billing_address?.address1 || null,
          }, { onConflict: 'phone' })
          .select('id');
        
        if (!custErr && customerData && customerData.length > 0) {
            customerId = customerData[0].id;
            console.log(`   - Customer Success: ${customerId}`);
        } else {
            console.error('   ❌ Error upserting customer:', custErr || 'No data returned');
            // Fallback manual fetch if upsert select failed
            const { data: existing } = await supabase.from('customers').select('id').eq('phone', customerPhone).maybeSingle();
            if (existing) customerId = existing.id;
        }
      }

      // A2. Upsert Abandoned Cart
      if (cartId && !body.status_code && !orderId) {
        console.log(`   - Upserting Abandoned Cart: ${cartId}`);
        const { data: cartDataArr, error: cartErr } = await supabase
          .from('abandoned_carts')
          .upsert({
            customer_id: customerId,
            phone: customerPhone || "unknown",
            email: rawEmail || null,
            cart_token: cartId,
            total_price: parseFloat(body.cart_value || body.total_price || body.cart_amount || 0),
            line_items: productList,
            recovery_status: 'pending',
            abandoned_at: log.created_at
          }, { onConflict: 'cart_token' })
          .select('id, abandoned_at');

        if (!cartErr && cartDataArr && cartDataArr.length > 0) {
          const cartData = cartDataArr[0];
          console.log(`   - Abandoned Cart Success: ${cartData.id}`);
          if (customerId) {
            const { data: settings } = await supabase.from('settings').select('recovery_delay_hours').single();
            const delayHours = settings?.recovery_delay_hours || 24;
            const dueDate = new Date(new Date(cartData.abandoned_at).getTime() + delayHours * 60 * 60 * 1000);

            await supabase.from('tasks').upsert({
              customer_id: customerId,
              abandoned_cart_id: cartData.id,
              task_type: 'recovery',
              due_date: dueDate.toISOString().split('T')[0],
              status: 'pending'
            }, { onConflict: 'abandoned_cart_id, task_type' });
            console.log('   - Task Success');
          }
        }
      }

      // A3. Upsert Order
      if (orderId && customerId) {
        console.log(`   - Upserting Order: ${orderId}`);
        const { error: orderErr } = await supabase.from('orders').upsert({
          customer_id: customerId,
          shopify_order_id: orderId.toString(),
          order_number: orderId.toString(),
          total_price: parseFloat(body.cart_value || body.total_price || 0),
          delivery_status: 'pending',
          ordered_at: log.created_at,
          source: 'shopify',
          line_items: productList
        }, { onConflict: 'shopify_order_id' });

        if (!orderErr) {
            console.log('   - Order Success');
            await supabase.from('abandoned_carts')
              .update({ recovery_status: 'recovered' })
              .eq('cart_token', cartId);
        }
      }

      // 4. Mark Log as Processed
      await supabase.from('webhook_logs').update({ 
        status: 'processed',
        topic: orderId ? 'order_placed' : 'cart_update'
      }).eq('id', log.id);

      console.log(`✅ Log ${log.id} processed.`);

    } catch (err) {
      console.error(`❌ Fatal Error processing log ${log.id}:`, err);
    }
  }

  console.log('🏁 Final Retro-Sync Complete!');
}

retroSync();
