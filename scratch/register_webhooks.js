// Script to register Shopify webhooks.
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// CONFIGURE THIS
const NGROK_HOST = "tenesha-unrecognizable-cristina.ngrok-free.dev";
const WEBHOOK_SECRET = "cureforever_secret_2026"; // Standardized secret for this session
const TOPICS = [
    "orders/create",
    "orders/updated", 
    "checkouts/create",
    "checkouts/update"
];

async function registerWebhooks() {
    console.log("🛠️ Registering Shopify Webhooks...");
    
    try {
        const { data: settings } = await supabase.from('settings').select('*').single();
        const domain = settings.shopify_store_domain;
        const token = settings.shopify_access_token;

        if (!domain || !token) throw new Error("Shopify credentials missing");

        // 1. Update secret in Supabase first
        console.log("🔐 Updating Webhook Secret in CRM Settings...");
        await supabase.from('settings').update({ shopify_webhook_secret: WEBHOOK_SECRET }).eq('id', settings.id);

        for (const topic of TOPICS) {
            console.log(`📡 Registering ${topic}...`);
            const res = await fetch(`https://${domain}/admin/api/2024-04/webhooks.json`, {
                method: "POST",
                headers: {
                    "X-Shopify-Access-Token": token,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    webhook: {
                        topic: topic,
                        address: `https://${NGROK_HOST}/api/webhooks/shopify`,
                        format: "json"
                    }
                })
            });

            const data = await res.json();
            if (res.ok) {
                console.log(`✅ ${topic} registered successfully.`);
            } else {
                console.warn(`⚠️ ${topic} registration failed:`, JSON.stringify(data.errors));
            }
        }

        console.log("\n🏁 WEBHOOK REGISTRATION COMPLETE!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Registration Failed:", err);
        process.exit(1);
    }
}

registerWebhooks();
