import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession } from "@/lib/auth-utils";

// GET /api/dashboard — returns today's tasks, overdue, upcoming, counts
export async function GET(req: NextRequest) {
  const { errorResponse, supabase } = await getAuthenticatedSession();
  
  if (errorResponse || !supabase) return errorResponse!;


  const today = new Date().toISOString().split("T")[0];
  const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];

  const [todayRes, overdueRes, upcomingRes, doneRes, recentRes] = await Promise.all([
    // Today's tasks
    supabase.from("tasks")
      .select("id, title, status, due_date, customer_id, order_id, task_type, customer:customers(id, name, phone, segment), order:orders(id, order_number, total_price)")
      .eq("due_date", today)
      .in("status", ["pending", "due"])
      .order("created_at", { ascending: true }),

    // Overdue tasks
    supabase.from("tasks")
      .select("id, title, status, due_date, customer_id, order_id, task_type, customer:customers(id, name, phone, segment), order:orders(id, order_number, total_price)")
      .lt("due_date", today)
      .not("status", "in", '("done","skipped","cancelled")')
      .order("due_date", { ascending: true }),

    // Upcoming (next 3 days, excluding today)
    supabase.from("tasks")
      .select("id, title, status, due_date, customer_id, order_id, task_type, customer:customers(id, name, phone, segment), order:orders(id, order_number, total_price)")
      .gt("due_date", today)
      .lte("due_date", in3Days)
      .eq("status", "pending")
      .order("due_date", { ascending: true }),

    // Done this week count
    supabase.from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "done")
      .gte("completed_at", new Date(Date.now() - 7 * 86400000).toISOString()),

    // Recent call logs
    supabase.from("call_logs")
      .select("id, status, duration, called_at, customer:customers(id, name, phone)")
      .order("called_at", { ascending: false })
      .limit(10),
  ]);

  return NextResponse.json({
    todayTasks: todayRes.data ?? [],
    overdueTasks: overdueRes.data ?? [],
    upcomingTasks: upcomingRes.data ?? [],
    recentActivity: recentRes.data ?? [],
    counts: {
      today: todayRes.data?.length ?? 0,
      overdue: overdueRes.data?.length ?? 0,
      upcoming: upcomingRes.data?.length ?? 0,
      doneThisWeek: doneRes.count ?? 0,
    },
  });
}
