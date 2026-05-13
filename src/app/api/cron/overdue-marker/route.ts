import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

function getSupabase() {
  return createServerClient();
}

export async function POST(req: NextRequest) {
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
