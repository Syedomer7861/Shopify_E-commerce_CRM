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
      twilio_caller_id,
      exotel_sid,
      exotel_token,
      exotel_caller_id,
    } = body;

    if (!phone) {
      return NextResponse.json({ ok: false, error: "Recipient phone number is required" }, { status: 400 });
    }

    if (provider === "demo") {
      console.log("[TELEPHONY TEST] Simulating demo call to:", phone);
      return NextResponse.json({ ok: true, message: "Demo mode simulated call queued successfully!" });
    }

    if (provider === "twilio") {
      if (!twilio_sid || !twilio_token || !twilio_caller_id) {
        return NextResponse.json({ ok: false, error: "Missing Twilio credentials in request" }, { status: 400 });
      }

      // Prepare basic authorization header
      const auth = Buffer.from(`${twilio_sid}:${twilio_token}`).toString("base64");
      
      // Twilio standard call endpoint
      const url = `https://api.twilio.com/2010-04-01/Accounts/${twilio_sid}/Calls.json`;
      
      const twimlXml = `<Response><Say voice="alice">Hello! This is a verification call from your CodeCrest CRM Cloud Telephony gateway. Your connection is working perfectly. Goodbye!</Say></Response>`;
      
      const params = new URLSearchParams();
      params.append("To", phone);
      params.append("From", twilio_caller_id);
      params.append("Twiml", twimlXml);

      console.log("[TELEPHONY TEST] Dispatching Twilio Call to:", phone);
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
        console.error("[TELEPHONY TEST] Twilio API Error:", responseText);
        return NextResponse.json({ ok: false, error: `Twilio Error: ${responseText}` }, { status: 500 });
      }

      return NextResponse.json({ ok: true, message: "Twilio test call queued successfully" });
    } 
    
    if (provider === "exotel") {
      if (!exotel_sid || !exotel_token || !exotel_caller_id) {
        return NextResponse.json({ ok: false, error: "Missing Exotel credentials in request" }, { status: 400 });
      }

      const auth = Buffer.from(`${exotel_sid}:${exotel_token}`).toString("base64");
      
      // Exotel connects two numbers: from and to
      const url = `https://api.exotel.com/v1/Accounts/${exotel_sid}/Calls/connect.json`;
      
      const params = new URLSearchParams();
      // In Exotel connect API: 'From' is first destination (recipient), 'To' is second destination (e.g. caller id or customer)
      params.append("From", phone);
      params.append("To", exotel_caller_id);
      params.append("CallerId", exotel_caller_id);

      console.log("[TELEPHONY TEST] Dispatching Exotel Call to:", phone);
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
        console.error("[TELEPHONY TEST] Exotel API Error:", responseText);
        return NextResponse.json({ ok: false, error: `Exotel Error: ${responseText}` }, { status: 500 });
      }

      return NextResponse.json({ ok: true, message: "Exotel test call queued successfully" });
    }

    return NextResponse.json({ ok: false, error: "No valid telephony provider selected" }, { status: 400 });
  } catch (err: any) {
    console.error("[TELEPHONY TEST] Unexpected Failure:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
