const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Manually parse .env.local
const envPath = path.join(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf8");
const env = {};
envContent.split("\n").forEach(line => {
  const [key, ...val] = line.split("=");
  if (key && val) env[key.trim()] = val.join("=").trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("--- Supabase Diagnostic ---");
  
  // 1. Check orders
  const { data: orders } = await supabase
    .from("orders")
    .select("id, delivery_status, delivered_at")
    .limit(25)
    .order("created_at", { ascending: false });

  console.log("Recent Orders Statuses:", orders.map(o => `${o.id.substring(0,8)}: ${o.delivery_status} (${o.delivered_at})`));

  // 2. Try to find delivered orders that match generator query
  const { data: delivered } = await supabase
    .from("orders")
    .select("id")
    .eq("delivery_status", "delivered")
    .not("delivered_at", "is", null);

  console.log(`Found ${delivered?.length || 0} orders matching 'delivered' status and not null date.`);

  // 3. Check for ANY tasks
  const { count } = await supabase.from("tasks").select("*", { count: "exact", head: true });
  console.log(`Total tasks in system: ${count}`);
}

run();
