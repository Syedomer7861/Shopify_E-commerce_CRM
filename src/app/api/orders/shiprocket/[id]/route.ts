import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSystemSettings } from "@/lib/server-settings";

export const dynamic = "force-dynamic";

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const orderId = resolvedParams.id;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // 1. Get Credentials
    const settings = await getSystemSettings(supabase);
    if (!settings?.shiprocket_email || !settings?.shiprocket_password) {
      return NextResponse.json({ error: "Shiprocket credentials not configured" }, { status: 400 });
    }

    // 2. Authenticate
    const authRes = await fetch(`${SHIPROCKET_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        email: settings.shiprocket_email.trim(), 
        password: settings.shiprocket_password.trim() 
      })
    });

    if (!authRes.ok) {
      return NextResponse.json({ error: "Shiprocket authentication failed" }, { status: 401 });
    }

    const { token } = await authRes.json();

    // 3. Fetch Order Details
    // Ensure orderId exists and is a string before proceeding
    const cleanId = String(orderId || "").trim();
    if (!cleanId || cleanId === "undefined" || cleanId === "null") {
      return NextResponse.json({ 
        error: `Invalid Order ID provided. Raw: "${orderId}", Clean: "${cleanId}"`,
        params: params
      }, { status: 400 });
    }

    let orderRes = await fetch(`${SHIPROCKET_BASE_URL}/orders/show/${cleanId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    let orderData: any = {};
    try {
      orderData = await orderRes.json();
    } catch (e) {
      console.error("[Shiprocket API] Failed to parse JSON response:", e);
    }

    let order = orderData.data || orderData;

    // --- ENHANCED PERSISTENT SEARCH ---
    if (!orderRes.ok || !order?.id) {
      console.log(`[Shiprocket API] Direct lookup for ${cleanId} failed, checking Local DB for mapping...`);
      
      // 1. Get local mapping (to find order_number)
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
      let localQuery = supabase.from("orders").select("*, customer:customers(*)").or(`shopify_order_id.eq.${cleanId},order_number.eq.${cleanId}${isUuid ? `,id.eq.${cleanId}` : ""}`);
      const { data: localData } = await localQuery.maybeSingle();

      const searchTerms = [cleanId];
      if (localData?.order_number) searchTerms.push(localData.order_number);
      if (localData?.shopify_order_id && localData.shopify_order_id !== cleanId) searchTerms.push(localData.shopify_order_id);
      
      // NUCLEAR OPTION: Search by customer identifiers if initial searches fail
      if (localData?.customer?.phone) searchTerms.push(localData.customer.phone);
      if (localData?.customer?.email) searchTerms.push(localData.customer.email);

      console.log(`[Shiprocket API] Expanded Search queue for ${cleanId}:`, searchTerms);

      for (const term of searchTerms) {
        if (!term) continue;
        const cleanTerm = String(term).replace("#", "").trim();
        if (cleanTerm.length < 3) continue; // Skip very short terms

        console.log(`[Shiprocket API] Trying search for term: "${cleanTerm}"`);
        
        // CRITICAL: Encode the search term to handle special characters like '+' in phone numbers
        const searchRes = await fetch(`${SHIPROCKET_BASE_URL}/orders?search=${encodeURIComponent(cleanTerm)}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const results = searchData.data || [];
          console.log(`[Shiprocket API] Search for "${cleanTerm}" returned ${results.length} results.`);
          
          // Find the best match - prioritize order number matches, then phone/email
          const found = results.find((o: any) => {
            const shiprocketOrderId = String(o.id || o.order_id || "");
            const channelOrderId = String(o.channel_order_id || "");
            const orderNo = String(o.order_no || "");
            const customerPhone = String(o.customer_phone || "");
            const customerEmail = String(o.customer_email || String(o.customer_email_address || ""));
            
            return channelOrderId.includes(cleanTerm) || 
                   shiprocketOrderId === cleanTerm || 
                   orderNo.includes(cleanTerm) ||
                   (cleanTerm.length > 5 && (customerPhone.includes(cleanTerm) || customerEmail.toLowerCase().includes(cleanTerm.toLowerCase())));
          });

          // Fallback to first result ONLY if we searched by a very specific identifier like Order Number or Shopify ID
          const match = found || (results.length > 0 && (cleanTerm === String(localData?.order_number) || cleanTerm === String(localData?.shopify_order_id)) ? results[0] : null);

          if (match?.id) {
            console.log(`[Shiprocket API] Match resolved! Channel Order: ${match.channel_order_id} (Shiprocket ID: ${match.id})`);
            const finalRes = await fetch(`${SHIPROCKET_BASE_URL}/orders/show/${match.id}`, {
              headers: { "Authorization": `Bearer ${token}` }
            });
            if (finalRes.ok) {
              const finalData = await finalRes.json();
              order = finalData.data || finalData;
              orderRes = finalRes;
              console.log(`[Shiprocket API] Full details loaded for ${match.id}`);
              break; 
            }
          }
        }
      }

      // 2. If STILL not found in Shiprocket but found in Local DB, return Local Mapped Data
      if ((!orderRes.ok || !order?.id) && localData) {
        console.log(`[Shiprocket API] Shiprocket search failed all terms. Returning Local Database Fallback for ${cleanId}`);
        const mappedOrder = {
          id: `LOCAL-${localData.shopify_order_id || localData.id}`,
          channel_order_id: localData.order_number || localData.shopify_order_id,
          status: localData.delivery_status || "PENDING",
          payment_method: "Prepaid",
          total: localData.total_price,
          sub_total: localData.total_price,
          customer_name: localData.customer?.name,
          customer_phone: localData.customer?.phone,
          customer_email: localData.customer?.email,
          billing_address: localData.customer?.address,
          billing_city: localData.customer?.city,
          billing_state: localData.customer?.state,
          billing_pincode: localData.customer?.zip,
          billing_country: "India",
          created_at: localData.ordered_at,
          order_items: Array.isArray(localData.line_items) ? localData.line_items.filter((i: any) => !i.__metadata) : [],
          shipments: [],
          is_local: true
        };

        return NextResponse.json({
          success: true,
          order: mappedOrder,
          tracking: null,
          is_local: true,
          message: "Order data retrieved from CRM Local Database (Awaiting Fulfillment)"
        });
      }
    }

    if (!orderRes.ok || !order?.id) {
      return NextResponse.json({ 
        error: `Order ${cleanId} not found in Shiprocket or Local Database.`,
        details: orderData.message || "The order might be too old or not yet synced with our system."
      }, { status: 404 });
    }

    // 4. Fetch Tracking Details if AWB exists
    let tracking: any = null;
    
    // Standardize shipments to always be an array
    const rawShipments = order.shipments;
    order.shipments = Array.isArray(rawShipments) ? rawShipments : (rawShipments ? [rawShipments] : []);
    
    // Deeper Search for Active Shipment identifiers
    const activeShipment = order.shipments.find((s: any) => s.awb) || order.shipments[0] || {};
    const awb = activeShipment.awb || order.awb_code || order.awb_no;
    const courier = activeShipment.courier || order.courier_name || order.courier;

    // Map critical fields back to root for UI consistency
    if (awb) order.awb_code = awb;
    if (courier) order.courier_name = courier;
    
    // Map Weights & Dimensions
    if (!order.weight) order.weight = activeShipment.weight || order.shipment_weight;
    order.shiprocket_length = activeShipment.length || order.length || 0;
    order.shiprocket_width = activeShipment.breadth || activeShipment.width || order.width || 0;
    order.shiprocket_height = activeShipment.height || order.height || 0;
    order.shiprocket_volumetric_weight = activeShipment.volumetric_weight || (order.shiprocket_length ? ((order.shiprocket_length * order.shiprocket_width * order.shiprocket_height) / 5000).toFixed(3) : 0);
    order.shipment_pickup_id = activeShipment.pickup_id || activeShipment.manifest_id || "";

    // Map RTO Risk if available in payload
    if (order.rto_risk || order.risk_score) {
      order.risk_factor = order.rto_risk?.toUpperCase() || (order.risk_score > 70 ? "HIGH" : order.risk_score > 30 ? "MEDIUM" : "LOW");
    }

    if (awb) {
      try {
        const trackRes = await fetch(`${SHIPROCKET_BASE_URL}/courier/track/awb/${awb}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (trackRes.ok) {
          const trackData = await trackRes.json();
          // Shiprocket normalization: tracking_data is the standard key we expect
          // but sometimes it's wrapped in the AWB key.
          const rawTracking = trackData[awb] || trackData;
          
          // Ensure we normalize to the structure expected by the frontend
          if (rawTracking.tracking_data) {
             tracking = rawTracking;
          } else {
             tracking = { 
               tracking_data: {
                 shipment_track: rawTracking.shipment_track || [],
                 shipment_track_activities: rawTracking.shipment_track_activities || []
               }
             };
          }
        }
      } catch (e) {
        console.error("Tracking fetch error:", e);
      }
    }

    return NextResponse.json({
      success: true,
      order,
      tracking,
      is_local: false
    });

  } catch (err: any) {
    console.error("Detailed Order Fetch Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
