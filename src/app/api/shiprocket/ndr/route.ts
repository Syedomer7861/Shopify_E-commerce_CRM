import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";
import { getSystemSettings } from "@/lib/server-settings";

export const dynamic = "force-dynamic";

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createServerClient();

  try {
    const body = await req.json();
    const { shipmentId, action, comments, proof_image, address_data } = body;

    if (!shipmentId || !action) {
      return NextResponse.json({ error: "Shipment ID and Action are required" }, { status: 400 });
    }

    // 1. Get Credentials
    const settings = await getSystemSettings(supabase);
    if (!settings?.shiprocket_email || !settings?.shiprocket_password) {
      return NextResponse.json({ error: "Shiprocket credentials not configured" }, { status: 400 });
    }

    // 2. Authenticate
    const authRes = await fetch(`${SHIPROCKET_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        email: settings.shiprocket_email.trim(), 
        password: settings.shiprocket_password.trim() 
      })
    });

    if (!authRes.ok) {
      return NextResponse.json({ error: "Shiprocket authentication failed" }, { status: 401 });
    }

    const { token } = await authRes.json();

    // 3. Map custom actions to Shiprocket standard actions
    let finalAction = action;
    let finalComments = comments || "";

    if (action === "deferred") {
      finalAction = "re_attempt";
      finalComments = `[DEFERRED ATTEMPT] ${finalComments}`;
    } else if (action === "escalate") {
      finalAction = "re_attempt";
      finalComments = `[ESC-FAKE ATTEMPT] Customer reports rider did not call. ${finalComments}`;
    } else if (action === "address_update") {
      finalAction = "re_attempt"; // Shiprocket uses re_attempt for address updates too
    }

    // 4. Trigger NDR Action
    const ndrPayload: any = {
      shipment_id: [shipmentId],
      action: finalAction,
    };

    if (finalComments) ndrPayload.comments = finalComments;
    if (proof_image) ndrPayload.proof_image = proof_image;
    if (address_data) {
      ndrPayload.address = address_data.address;
      ndrPayload.address_2 = address_data.address_2;
      ndrPayload.city = address_data.city;
      ndrPayload.state = address_data.state;
      ndrPayload.pincode = address_data.pincode;
      ndrPayload.phone = address_data.phone;
    }

    const ndrRes = await fetch(`${SHIPROCKET_BASE_URL}/ndr/action`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(ndrPayload)
    });

    const ndrData = await ndrRes.json();

    if (!ndrRes.ok) {
      return NextResponse.json({ 
        error: ndrData.message || "Shiprocket NDR action failed",
        details: ndrData 
      }, { status: ndrRes.status });
    }

    return NextResponse.json({
      success: true,
      message: `NDR Action '${action}' submitted successfully`,
      data: ndrData
    });

  } catch (err: any) {
    console.error("[Shiprocket NDR] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
