import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// POST /api/tasks/bulk-done
// Marks all "overdue" tasks (past due_date, not done/cancelled) as done
export async function POST(req: Request) {
  const secret = req.headers.get("x-admin-secret");
  if (secret !== process.env.SYNC_SECRET && secret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // Match the same "overdue" logic as the UI: due_date < today, not done/cancelled
  const { data, error } = await supabase
    .from("tasks")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
      manager_note: "Auto-completed (Bulk Overdue Cleanup)",
    })
    .lt("due_date", today)
    .not("status", "in", '("done","cancelled","skipped")')
    .select("id, due_date, task_type, status");

  if (error) {
    console.error("[bulk-done] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    marked_done: data.length,
    cutoff_date: today,
    message: `Successfully marked ${data.length} overdue tasks as done`,
  });
}
