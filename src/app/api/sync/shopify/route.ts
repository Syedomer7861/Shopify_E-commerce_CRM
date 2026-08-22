import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSystemSettings, getShopifyAccessToken } from "@/lib/server-settings";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";

// Vercel Hobby caps functions at 60s; a higher value fails the deploy.
// On Pro this can go to 300. The syncs are incremental, so a cut-off run
// resumes on the next tick.
export const maxDuration = 60;

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
