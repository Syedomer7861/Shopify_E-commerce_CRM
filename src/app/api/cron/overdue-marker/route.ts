import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requirePrivileged } from "@/lib/auth-utils";

function getSupabase() {
  return createAdminClient();
}

export async function POST(req: NextRequest) {
  const unauthorized = await requirePrivileged(req, ["manage_automations"]);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("tasks")
    .update({ status: "overdue" } as any)
    .lt("due_date", today)
    .in("status", ["pending", "due"])
    .select("id");

  return NextResponse.json({ marked: data?.length ?? 0, error: error?.message });
}

// Vercel Cron invokes scheduled paths with GET.
export const GET = POST;
