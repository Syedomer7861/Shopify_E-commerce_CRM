import { NextRequest, NextResponse } from "next/server";
import { createServerClient, getServiceSupabase } from "@/lib/supabase";
import { getSystemSettings, getShopifyAccessToken } from "@/lib/server-settings";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";

import { createSyncStream, syncHeaders } from "@/lib/sync-stream";
import { syncShopifyData, syncReviewTasks } from "@/lib/sync-logic";

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  const { stream, send, close } = createSyncStream();
  const streaming = req.nextUrl.searchParams.get("stream") === "true";

  const supabase = getServiceSupabase(req);

  const authHeader = req.headers.get("x-sync-secret");
  const isInternal = authHeader === process.env.SUPABASE_SERVICE_ROLE_KEY;

  const runSync = async () => {
    try {
      const full = req.nextUrl.searchParams.get("full") === "true";
      const syncReport = await syncShopifyData(supabase, send, full);
      
      send({ progress: 90, message: "Syncing Review Tasks..." });
      const reviewTasksCreated = await syncReviewTasks(supabase);
      syncReport.tasks.created += reviewTasksCreated;

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
    try {
      const isFull = req.nextUrl.searchParams.get("full") === "true";
      const finalReport = await syncShopifyData(supabase, () => {}, isFull);
      const reviewTasksCreated = await syncReviewTasks(supabase);
      finalReport.tasks.created += reviewTasksCreated;
      
      return NextResponse.json({ success: true, report: finalReport });
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
  }
}
