import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getServiceSupabase } from "@/lib/supabase";
import { getSystemSettings, getShopifyAccessToken } from "@/lib/server-settings";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";

// Vercel Hobby caps functions at 60s; a higher value fails the deploy.
// On Pro this can go to 300 (raise SYNC_BUDGET_MS to match).
export const maxDuration = 60;

// Stop the sync before the platform kills it, leaving room for the review-task
// pass and the JSON response. A killed function returns a 504 with no report,
// so the caller never learns what was written; stopping early returns a real
// report with truncated: true and the next run continues.
const SYNC_BUDGET_MS = 40_000;

import { createSyncStream, syncHeaders } from "@/lib/sync-stream";
import { syncShopifyData, syncReviewTasks } from "@/lib/sync-logic";
import { requireInternal } from "@/lib/auth-utils";

export async function GET(req: NextRequest) {
  // Delegates to POST, which applies the rate limit. Counting here too would
  // charge a GET caller twice and halve the real limit.
  return POST(req);
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "sync", 5, 60000);
  if (limited) return limited;

  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const { stream, send, close } = createSyncStream();
  const streaming = req.nextUrl.searchParams.get("stream") === "true";

  const supabase = getServiceSupabase(req);

  const runSync = async () => {
    try {
      const full = req.nextUrl.searchParams.get("full") === "true";
      const syncReport = await syncShopifyData(supabase, send, full, { budgetMs: SYNC_BUDGET_MS });

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
      const finalReport = await syncShopifyData(supabase, () => {}, isFull, { budgetMs: SYNC_BUDGET_MS });
      const reviewTasksCreated = await syncReviewTasks(supabase);
      finalReport.tasks.created += reviewTasksCreated;

      // 200 either way: a truncated run is partial progress, not an error.
      // The scheduler reads `truncated` to know more work is waiting.
      return NextResponse.json({ success: true, truncated: finalReport.truncated, report: finalReport });
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
  }
}
