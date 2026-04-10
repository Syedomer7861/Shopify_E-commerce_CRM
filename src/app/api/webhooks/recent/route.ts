import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    // Use service role to bypass RLS for dashboard feed
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
