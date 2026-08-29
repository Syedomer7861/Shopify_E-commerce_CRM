import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { hasInternalSecret } from "@/lib/auth-utils";
import { uploadToDrive } from "@/lib/google-drive";

/**
 * GET /api/backup
 * Triggers a full database backup to Google Drive.
 * Secure this with the CRON_SECRET (header only - see below).
 */
export async function GET(req: NextRequest) {
  // The old ?secret= query-string form was removed: a secret in the URL
  // gets written into Vercel access logs, browser history, and any proxy
  // in between, in plaintext, forever. Nothing was found calling it (not
  // scheduled anywhere, no other code references this route at all), so
  // there was nothing to migrate - just a real leak vector with no live
  // caller to break.
  if (!hasInternalSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const tables = [
    "customers", 
    "orders", 
    "tasks", 
    "call_logs", 
    "agent_activity_logs", 
    "abandoned_carts", 
    "webhook_logs", 
    "system_settings", 
    "workflows", 
    "workflow_logs",
    "attendance_logs",
    "leave_requests",
    "agent_performance_metrics",
    "campaigns",
    "templates",
    "audit_logs"
  ];
  const timestamp = new Date().toISOString().split("T")[0];
  const results: any[] = [];

  try {
    for (const table of tables) {
      // Fetch all data from table (max 1000 for backup safety, 
      // or implement pagination if your DB is massive)
      const { data, error } = await supabase.from(table).select("*").limit(5000);
      
      if (error) throw error;

      if (data && data.length > 0) {
        const csv = jsonToCsv(data);
        const filename = `${table}_backup_${timestamp}.csv`;
        const driveId = await uploadToDrive(filename, csv);
        results.push({ table, filename, driveId });
      } else {
        results.push({ table, status: "empty" });
      }
    }

    return NextResponse.json({ 
      success: true, 
      timestamp: new Date().toISOString(),
      backups: results 
    });
  } catch (error: any) {
    console.error("Backup failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Simple JSON to CSV converter
 */
function jsonToCsv(data: any[]) {
  if (data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const rows = data.map(obj => 
    headers.map(header => {
      let val = obj[header];
      if (val === null || val === undefined) return "";
      if (typeof val === "object") val = JSON.stringify(val);
      // Escape quotes and wrap in quotes
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}
