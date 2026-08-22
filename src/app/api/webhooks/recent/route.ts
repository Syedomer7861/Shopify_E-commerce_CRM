import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireInternal } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  try {
    const supabase = createServerClient();

    const { data: logsData, error } = await supabase
      .from("webhook_logs")
      .select("id, topic, created_at, payload")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;
    
    return NextResponse.json({ success: true, logs: logsData || [] });
  } catch (error: any) {
    console.error("Dashboard Feed Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
