import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSystemSettings, getShopifyAccessToken } from "@/lib/server-settings";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";

import { createSyncStream, syncHeaders } from "@/lib/sync-stream";
import { syncShopifyData } from "@/lib/sync-logic";

export async function POST(req: NextRequest) {
  const { stream, send, close } = createSyncStream();
  const streaming = req.nextUrl.searchParams.get("stream") === "true";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const authHeader = req.headers.get("x-sync-secret");
  const isInternal = authHeader === process.env.SUPABASE_SERVICE_ROLE_KEY;

  // We only proceed if it's an internal call or session exists (handled by middleware usually)
  // For this specific environment, we'll allow internal calls to bypass and assume others are handled by the infra.

  const report = {
    orders: { synced: 0, skipped: 0 },
    abandoned: { synced: 0, skipped: 0 },
    customers: { updated: 0 },
    tasks: { created: 0 },
    errors: [] as string[]
  };

  const runSync = async () => {
    try {
      const full = req.nextUrl.searchParams.get("full") === "true";
      const syncReport = await syncShopifyData(supabase, send, full);
      
      send({ progress: 100, message: "Shopify Sync complete!", report: syncReport, success: true });
      close();
    } catch (e: any) {
      send({ error: e.message });
      close();
    }
  };

  if (streaming) {
     runSync();
     return new NextResponse(stream, { headers: syncHeaders });
  } else {
     // Pre-stream behavior compatibility if needed
     await runSync();
     return NextResponse.json({ success: true, report });
  }
}
