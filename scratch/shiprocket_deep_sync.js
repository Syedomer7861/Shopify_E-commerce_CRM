// Standalone script for Deep Shiprocket Sync
const { createClient } = require('@supabase/supabase-js');

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function mapShiprocketStatus(status) {
    const s = String(status).toLowerCase();
    if (s.includes("rto") || s === "9") return "rto";
    if (s.includes("delivered") || s === "7" || s === "10") return "delivered";
    if (s.includes("shipped") || s === "6" || s === "12" || s.includes("transit")) return "in_transit";
    if (s.includes("out for delivery") || s === "13") return "out_for_delivery";
    if (s.includes("canceled") || s === "8" || s.includes("cancel")) return "failed";
    return "pending";
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function deepShiprocketSync() {
    console.log("🚀 Starting DEEP Shiprocket Sync...");

    try {
        const { data: settings } = await supabase.from('settings').select('*').single();
        if (!settings?.shiprocket_email || !settings?.shiprocket_password) throw new Error("Shiprocket credentials missing");

        const authRes = await fetch(`${SHIPROCKET_BASE_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: settings.shiprocket_email.trim(), password: settings.shiprocket_password.trim() })
        });

        const { token } = await authRes.json();
        if (!token) throw new Error("Auth Failed");

        let page = 1;
        let hasMore = true;
        let totalProcessed = 0;

        while (hasMore) {
            console.log(`📦 Fetching Shiprocket Page ${page}...`);
            const res = await fetch(`${SHIPROCKET_BASE_URL}/orders?per_page=50&page=${page}&sort=created_at&sort_dir=desc`, {
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (res.status === 429) { await sleep(10000); continue; }
            const data = await res.json();
            const orders = data.data || [];
            if (orders.length === 0) break;

            for (const sr of orders) {
                const orderId = sr.channel_order_id || sr.id;
                const status = mapShiprocketStatus(sr.status || "");
                
                // Optimized update: only update delivery status and tracking
                await supabase.from("orders").upsert({
                    shopify_order_id: String(orderId),
                    order_number: String(sr.order_no || orderId),
                    delivery_status: status,
                    tracking_number: sr.shipments?.[0]?.awb || sr.awb_code || null,
                    source: "shiprocket"
                }, { onConflict: "shopify_order_id" });
                
                totalProcessed++;
            }

            console.log(`✅ Processed Batch ${page}. Total: ${totalProcessed}`);
            const meta = data.meta?.pagination;
            hasMore = page < (meta?.total_pages || 1000);
            page++;
            await sleep(300);
        }

        console.log("🏁 DEEP SHIPROCKET SYNC COMPLETE!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Failed:", err);
        process.exit(1);
    }
}

deepShiprocketSync();
