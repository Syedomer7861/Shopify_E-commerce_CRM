import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { WorkflowEngine } from "@/lib/workflow-engine";
import { requireInternal } from "@/lib/auth-utils";

function getSupabase() {
  return createServerClient();
}

/**
 * Background Executor for Workflow instances
 * Runs every ~10 mins to process delayed steps.
 */
export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  const now = new Date().toISOString();

  try {
    // 1. Fetch instances that are due for their next step
    const { data: instances, error } = await supabase
      .from("workflow_instances")
      .select("*")
      .eq("status", "active")
      .lte("next_run_at", now);

    if (error) throw error;

    if (!instances || instances.length === 0) {
      return NextResponse.json({ processed: 0, status: "idle" });
    }

    console.log(`🤖 Workflow Executor: Found ${instances.length} instances to process.`);

    const results = await Promise.allSettled(
      instances.map(instance => WorkflowEngine.executeStep(instance))
    );

    const successful = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;

    return NextResponse.json({
      processed: instances.length,
      successful,
      failed
    });

  } catch (err: any) {
    console.error("❌ Workflow Executor Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Vercel Cron invokes scheduled paths with GET.
export const GET = POST;
