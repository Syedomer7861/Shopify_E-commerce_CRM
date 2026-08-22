import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSystemSettings, getShopifyAccessToken } from "@/lib/server-settings";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";

// Vercel Cron invokes this; 300s is the Pro ceiling. On Hobby (60s) a full
// sync will be cut off part-way - it is incremental, so the next run resumes.
export const maxDuration = 300;

import { createSyncStream, syncHeaders } from "@/lib/sync-stream";
import { syncShopifyData, syncReviewTasks } from "@/lib/sync-logic";
import { requireInternal } from "@/lib/auth-utils";

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const { stream, send, close } = createSyncStream();
  const streaming = req.nextUrl.searchParams.get("stream") === "true";

  const supabase = getServiceSupabase(req);

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
