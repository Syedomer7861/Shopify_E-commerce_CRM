import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { sendWhatsApp, cleanPhone, personaliseTemplate } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  try {
    const { phone, message, customerData, imagePath } = await req.json();

    if (!phone || !message) {
      return NextResponse.json({ ok: false, error: "Phone and message are required" }, { status: 400 });
    }

    const cleanedPhone = cleanPhone(phone);
    const finalMessage = customerData ? personaliseTemplate(message, customerData) : message;

    const result = await sendWhatsApp(cleanedPhone, finalMessage, imagePath);

    if (result.ok) {
      return NextResponse.json({ ok: true });
    } else {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
