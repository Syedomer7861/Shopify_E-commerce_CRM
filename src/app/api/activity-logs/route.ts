import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { appendToSheet } from "@/lib/google-sheets";
import { analyzeSentiment } from "@/lib/utils";

/**
 * POST /api/activity-logs
 * Centralized endpoint to log agent/system activity and sync to Google Sheets.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();

  const { agent_id, activity_type, description } = body;
  let { metadata } = body;

  // 🚀 PHASE 2: Sentiment Analysis for call resolutions
  if (activity_type === "task_completion" && description) {
    const sentiment = analyzeSentiment(description);
    metadata = { ...metadata, sentiment };
  }

  try {
    // 1. Insert into Supabase
    const { data, error } = await supabase.from("agent_activity_logs").insert({
      agent_id,
      activity_type,
      metadata,
      description
    }).select("id, created_at").single();

    if (error) throw error;

    // 2. Live Sync to Google Sheets (Intelligent Routing)
    // We don't await this to keep the API responsive
    const syncData = {
      timestamp: data.created_at,
      user: metadata?.agent_email || agent_id || "System",
      action: activity_type,
      details: description || "",
      metadata: metadata ? JSON.stringify(metadata) : ""
    };

    // Master Audit Log
    appendToSheet("Audit_Logs", syncData).catch(err => console.error("Sync to Audit_Logs failed:", err));

    // Targeted Tabs for In-Depth Analysis
    if (activity_type === "task_completed" || activity_type === "task_completion") {
      appendToSheet("Task_Resolutions", {
        task_id: metadata?.task_id || "N/A",
        task_type: metadata?.task_type || "N/A",
        customer: metadata?.customer_name || "N/A",
        action: "complete",
        outcome: metadata?.outcome || "done",
        note: metadata?.note || "",
        agent: metadata?.agent_email || agent_id || "System",
        timestamp: data.created_at
      }).catch(err => console.error("Sync to Task_Resolutions failed:", err));
    } else if (activity_type === "whatsapp") {
      appendToSheet("WhatsApp_Logs", syncData).catch(err => console.error("Sync to WhatsApp_Logs failed:", err));
    } else if (activity_type.includes("attendance") || activity_type.includes("clock")) {
      appendToSheet("Attendance_Logs", syncData).catch(err => console.error("Sync to Attendance_Logs failed:", err));
    }

    return NextResponse.json({ success: true, id: data.id });
  } catch (error: any) {
    console.error("Activity logging failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
