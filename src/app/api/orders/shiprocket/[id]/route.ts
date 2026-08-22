import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";
import { getSystemSettings } from "@/lib/server-settings";

export const dynamic = "force-dynamic";

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

export async function GET(req: NextRequest,
  { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const resolvedParams = await params;
  const orderId = resolvedParams.id;

  const supabase = createServerClient();

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
    const cleanId = String(orderId || "").trim();
    if (!cleanId || cleanId === "undefined" || cleanId === "null") {
      return NextResponse.json({ 
        error: `Invalid Order ID provided. Raw: "${orderId}", Clean: "${cleanId}"`
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
      
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
      let localQuery = supabase.from("orders").select("*, customer:customers(*)").or(`shopify_order_id.eq.${cleanId},order_number.eq.${cleanId},tracking_number.eq.${cleanId}${isUuid ? `,id.eq.${cleanId}` : ""}`);
      const { data: localData } = await localQuery.maybeSingle();

      const searchTerms: string[] = [cleanId];
      if (localData?.order_number) searchTerms.push(String(localData.order_number));
      if (localData?.shopify_order_id && localData.shopify_order_id !== cleanId) searchTerms.push(String(localData.shopify_order_id));
      if (localData?.tracking_number && localData.tracking_number !== cleanId) searchTerms.push(String(localData.tracking_number));
      if (localData?.customer?.phone) searchTerms.push(localData.customer.phone);
      if (localData?.customer?.email) searchTerms.push(localData.customer.email);

      for (const term of searchTerms) {
        if (!term) continue;
        const cleanTerm = String(term).replace("#", "").trim();
        if (cleanTerm.length < 3) continue; 

        let resolvedOrderId = null;

        const looksLikeAwb = /^[0-9]{8,15}$/.test(cleanTerm) && (cleanTerm.startsWith("8") || cleanTerm.startsWith("1") || cleanTerm.startsWith("4"));
        if (looksLikeAwb) {
            const trackRes = await fetch(`${SHIPROCKET_BASE_URL}/courier/track/awb/${cleanTerm}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (trackRes.ok) {
                const trackData = await trackRes.json();
                const firstResult = trackData[cleanTerm] || trackData;
                const innerTrack = firstResult?.tracking_data?.shipment_track?.[0] || firstResult?.shipment_track?.[0];
                if (innerTrack?.order_id) resolvedOrderId = innerTrack.order_id;
            }
        }

        if (!resolvedOrderId) {
            const searchRes = await fetch(`${SHIPROCKET_BASE_URL}/orders?search=${encodeURIComponent(cleanTerm)}`, {
              headers: { "Authorization": `Bearer ${token}` }
            });

            if (searchRes.ok) {
              const searchData = await searchRes.json();
              const results = searchData.data || [];
              const match = results.find((o: any) => {
                const shiprocketOrderId = String(o.id || o.order_id || "");
                const channelOrderId = String(o.channel_order_id || "");
                const orderNo = String(o.order_no || "");
                const customerPhone = String(o.customer_phone || "");
                const customerEmail = String(o.customer_email || "");
                
                return channelOrderId.includes(cleanTerm) || 
                       shiprocketOrderId === cleanTerm || 
                       orderNo.includes(cleanTerm) ||
                       (cleanTerm.length > 5 && (customerPhone.includes(cleanTerm) || customerEmail.toLowerCase().includes(cleanTerm.toLowerCase())));
              });
              if (match?.id) resolvedOrderId = match.id;
            }
        }

        if (resolvedOrderId) {
            const finalRes = await fetch(`${SHIPROCKET_BASE_URL}/orders/show/${resolvedOrderId}`, {
              headers: { "Authorization": `Bearer ${token}` }
            });
            if (finalRes.ok) {
              const finalData = await finalRes.json();
              order = finalData.data || finalData;
              orderRes = finalRes;
              break; 
            }
        }
      }

      if ((!orderRes.ok || !order?.id) && localData) {
        const meta = (Array.isArray(localData.line_items) ? localData.line_items.find((i: any) => i.__metadata) : null)?.payload || {};
        const mappedOrder = {
          id: `LOCAL-${localData.shopify_order_id || localData.id}`,
          channel_order_id: localData.order_number || localData.shopify_order_id,
          status: localData.delivery_status || "PENDING",
          payment_method: localData.payment_gateway || "Prepaid",
          total: Number(localData.total_price || 0),
          sub_total: Number(localData.total_price || 0),
          customer_name: localData.customer?.name,
          customer_phone: localData.customer?.phone,
          customer_email: localData.customer?.email,
          billing_address: localData.customer?.address,
          billing_address_2: "",
          billing_city: localData.customer?.city,
          billing_state: localData.customer?.state,
          billing_pincode: localData.customer?.zip,
          billing_country: localData.customer?.country || "India",
          created_at: localData.ordered_at || localData.created_at,
          order_items: Array.isArray(localData.line_items) ? localData.line_items.filter((i: any) => !i.__metadata).map((i: any) => ({
            name: i.name || i.title || "Unknown Product",
            sku: i.sku || "—",
            units: i.qty || i.quantity || 1,
            selling_price: i.price || 0,
            discount: 0,
            tax: 0,
            total: (i.qty || i.quantity || 1) * (i.price || 0)
          })) : [],
          shipments: [],
          courier_name: meta.courier || null,
          awb_code: meta.tracking_number || localData.tracking_number,
          weight: meta.weight || 0,
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

    let tracking: any = null;
    const rawShipments = order.shipments;
    order.shipments = Array.isArray(rawShipments) ? rawShipments : (rawShipments ? [rawShipments] : []);
    
    const activeShipment = order.shipments.find((s: any) => s.awb) || order.shipments[0] || {};
    const awb = activeShipment.awb || order.awb_code || order.awb_no;
    const courier = activeShipment.courier || order.courier_name || order.courier;

    if (awb) order.awb_code = awb;
    if (courier) order.courier_name = courier;
    
    if (!order.weight) order.weight = activeShipment.weight || order.shipment_weight;
    order.shiprocket_length = activeShipment.length || order.length || 0;
    order.shiprocket_width = activeShipment.breadth || activeShipment.width || order.width || 0;
    order.shiprocket_height = activeShipment.height || order.height || 0;
    order.shiprocket_volumetric_weight = activeShipment.volumetric_weight || (order.shiprocket_length ? ((order.shiprocket_length * order.shiprocket_width * order.shiprocket_height) / 5000).toFixed(3) : 0);
    order.shipment_pickup_id = activeShipment.pickup_id || activeShipment.manifest_id || "";

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
          const rawTracking = trackData[awb] || trackData.tracking_data || trackData.data?.[0] || trackData;
          if (rawTracking.tracking_data) {
             tracking = rawTracking;
          } else {
             const activities = rawTracking.shipment_track_activities || rawTracking.activities || rawTracking.scans || [];
             const shipmentTrack = rawTracking.shipment_track || (rawTracking.status ? [rawTracking] : []);
             tracking = { 
               tracking_data: {
                 shipment_track: shipmentTrack,
                 shipment_track_activities: activities
               }
             };
          }
        }
      } catch (e) {
        console.error("Tracking fetch error:", e);
      }
    }

    if (!tracking?.tracking_data?.shipment_track_activities?.length && order.id && !String(order.id).startsWith("LOCAL-")) {
      try {
        const trackRes = await fetch(`${SHIPROCKET_BASE_URL}/courier/track/order/${order.id}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (trackRes.ok) {
          const trackData = await trackRes.json();
          const rawTracking = trackData[order.id] || trackData.tracking_data || trackData;
          if (rawTracking.tracking_data) {
            tracking = rawTracking;
          } else {
            const activities = rawTracking.shipment_track_activities || rawTracking.activities || [];
            const shipmentTrack = rawTracking.shipment_track || [];
            if (activities.length > 0) {
              tracking = {
                tracking_data: {
                  shipment_track: shipmentTrack,
                  shipment_track_activities: activities
                }
              };
            }
          }
        }
      } catch (e) {
        console.error("Order ID tracking fetch error:", e);
      }
    }

    // 5. Fetch Detailed Order History (Activity Log)
    let history: any[] = [];
    if (order.id && !String(order.id).startsWith("LOCAL-")) {
      try {
        const historyRes = await fetch(`${SHIPROCKET_BASE_URL}/orders/history/order_id/${order.id}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          history = historyData.activities || [];
        }
      } catch (e) {
        console.error("Order history fetch error:", e);
      }
    }

    return NextResponse.json({
      success: true,
      order,
      tracking,
      history,
      shiprocket_order_id: order.id,
      shipment_id: activeShipment.id || order.shipment_id || order.id,
      is_local: false
    });

  } catch (err: any) {
    console.error("Detailed Order Fetch Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
