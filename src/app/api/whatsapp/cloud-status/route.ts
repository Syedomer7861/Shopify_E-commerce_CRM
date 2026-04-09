import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { checkUltraMsgStatus } from "@/lib/whatsapp-ultramsg";

export async function GET() {
  try {
    const supabase = createClient();
    const { data: settings } = await supabase.from("settings").select("*").single();

    if (settings?.whatsapp_provider !== "cloud") {
      return NextResponse.json({ state: "NOT_IN_CLOUD_MODE" });
    }

    const { ultramsg_instance_id, ultramsg_token } = settings;
    if (!ultramsg_instance_id || !ultramsg_token) {
      return NextResponse.json({ state: "MISSING_CONFIG" });
    }

    const status = await checkUltraMsgStatus(ultramsg_instance_id, ultramsg_token);
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json({ ready: false, state: "ERROR", error: err.message }, { status: 500 });
  }
}
