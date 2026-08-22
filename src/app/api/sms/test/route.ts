import { NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";

export async function POST(req: Request) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const {
      phone,
      provider,
      twilio_sid,
      twilio_token,
      twilio_number,
    } = body;

    if (!phone) {
      return NextResponse.json({ ok: false, error: "Recipient phone number is required" }, { status: 400 });
    }

    if (provider === "twilio") {
      if (!twilio_sid || !twilio_token || !twilio_number) {
        return NextResponse.json({ ok: false, error: "Missing Twilio SMS credentials in request" }, { status: 400 });
      }

      // Basic Auth Header
      const auth = Buffer.from(`${twilio_sid}:${twilio_token}`).toString("base64");
      
      // Twilio Messages Endpoint
      const url = `https://api.twilio.com/2010-04-01/Accounts/${twilio_sid}/Messages.json`;
      
      const params = new URLSearchParams();
      params.append("To", phone);
      params.append("From", twilio_number);
      params.append("Body", "CureForever CRM SMS Gateway Verification: Outbound SMS routing and API integration are fully functional!");

      console.log("[SMS TEST] Dispatching Twilio SMS to:", phone);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const responseText = await res.text();
      if (!res.ok) {
        console.error("[SMS TEST] Twilio API Error:", responseText);
        return NextResponse.json({ ok: false, error: `Twilio SMS Error: ${responseText}` }, { status: 500 });
      }

      return NextResponse.json({ ok: true, message: "Twilio test SMS sent successfully" });
    }

    return NextResponse.json({ ok: false, error: "No valid SMS provider selected" }, { status: 400 });
  } catch (err: any) {
    console.error("[SMS TEST] Unexpected Failure:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
