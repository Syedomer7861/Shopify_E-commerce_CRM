
import { createClient } from "@supabase/supabase-js";
import { syncShopifyData } from "../src/lib/sync-logic";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log("Starting Deep Shopify Sync...");
  const send = (data: any) => {
    if (data.message) console.log(`[STREAM] ${data.message}`);
    if (data.error) console.error(`[ERROR] ${data.error}`);
  };

  try {
    const report = await syncShopifyData(supabase, send, true); // true for full sync
    console.log("Shopify Sync Complete!");
    console.log("Report:", JSON.stringify(report, null, 2));
  } catch (err: any) {
    console.error("Sync Failed:", err.message);
  }
}

run();
