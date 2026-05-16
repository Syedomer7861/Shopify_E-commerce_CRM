import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * Call Recording Upload Endpoint
 * Receives audio files from MacroDroid/Android and stores them in Supabase.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const agentEmail = formData.get("agent_email") as string;
    const customerPhone = formData.get("customer_phone") as string;
    const taskId = formData.get("task_id") as string;

    if (!file || !agentEmail) {
      return NextResponse.json({ error: "Missing file or agent email" }, { status: 400 });
    }

    // 1. Resolve Agent
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", agentEmail)
      .single();

    if (!profile) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    // 2. Standardize Phone for filename
    let phone = (customerPhone || "unknown").toString().trim().replace(/[^\d]/g, "");
    if (phone.length > 10) phone = phone.slice(-10);

    // 3. Upload to Supabase Storage
    const fileName = `recordings/${profile.id}/${Date.now()}_${phone}.m4a`;
    const arrayBuffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("call-recordings")
      .upload(fileName, arrayBuffer, {
        contentType: file.type || "audio/m4a",
        cacheControl: "3600",
        upsert: false
      });

    if (uploadError) throw uploadError;

    // 4. Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from("call-recordings")
      .getPublicUrl(fileName);

    // 5. Link to the most recent completed call log
    const { data: lastCall } = await supabase
      .from("raw_call_logs")
      .select("id")
      .eq("agent_id", profile.id)
      .eq("customer_phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastCall) {
      await supabase.from("raw_call_logs").update({
        recording_url: publicUrl
      }).eq("id", lastCall.id);
      
      // Also update the task's call_logs if it exists
      if (taskId) {
          const { data: callLog } = await supabase
            .from("call_logs")
            .select("id")
            .eq("task_id", taskId)
            .order("called_at", { ascending: false })
            .limit(1)
            .maybeSingle();
            
          if (callLog) {
              const currentNote = (callLog as any).note || "";
              await supabase.from("call_logs").update({
                  note: `${currentNote} [Recording Attached: ${publicUrl}]`.trim()
              } as any).eq("id", callLog.id);
          }
      }
    }

    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (err: any) {
    console.error("[RECORDING-UPLOAD] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
