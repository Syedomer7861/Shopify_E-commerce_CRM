import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { from, body, timestamp } = await req.json();

    // 1. Clean the incoming phone number (remove @c.us and non-digits)
    const phone = from.split("@")[0].replace(/[^\d]/g, "");
    const cleanPhone = phone.startsWith("91") && phone.length > 10 ? phone.slice(-10) : phone;

    console.log(`📩 WhatsApp Webhook: Received message from ${cleanPhone}`);

    // 2. Identify Customer and update last activity
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", cleanPhone)
      .maybeSingle();

    if (custErr) throw custErr;

    if (customer) {
      await supabase.from("customers").update({
        last_wa_inbound_at: new Date(timestamp * 1000).toISOString(),
        updated_at: new Date().toISOString()
      }).eq("id", customer.id);

      // Log the activity
      await supabase.from("webhook_logs").insert({
        source: "whatsapp",
        topic: "message",
        payload: { from: cleanPhone, body: body.substring(0, 100) },
        status: "processed"
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("❌ WhatsApp Webhook Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
