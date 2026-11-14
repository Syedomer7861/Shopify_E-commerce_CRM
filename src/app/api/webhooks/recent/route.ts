import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getAuthenticatedSession } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Raw payloads carry customer data: only the caller's own workspace, never platform-wide.
export async function GET(_req: NextRequest) {
  const { errorResponse, profile } = await getAuthenticatedSession();
  if (errorResponse) return errorResponse;
  if (!profile?.org_id) return NextResponse.json({ success: true, logs: [] });

  try {
    const supabase = createAdminClient();

    const { data: logsData, error } = await supabase
      .from("webhook_logs")
      .select("id, topic, created_at, payload")
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;
    
    return NextResponse.json({ success: true, logs: logsData || [] });
  } catch (error: any) {
    console.error("Dashboard Feed Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
