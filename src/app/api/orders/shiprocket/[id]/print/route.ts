import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";
import { getSystemSettings } from "@/lib/server-settings";

export const dynamic = "force-dynamic";

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

export async function GET(req: NextRequest,
  { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const resolvedParams = await params;
  const orderId = resolvedParams.id;

  const supabase = createServerClient();

  try {
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

    if (!authRes.ok) return NextResponse.json({ error: "Auth failed" }, { status: 401 });
    const { token } = await authRes.json();

    // 3. Request Public Invoice URL
    const printRes = await fetch(`${SHIPROCKET_BASE_URL}/orders/print/invoice`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({ ids: [parseInt(orderId)] })
    });

    if (!printRes.ok) {
        return NextResponse.json({ error: "Failed to generate invoice URL" }, { status: 500 });
    }

    const printData = await printRes.json();
    
    if (printData.invoice_url) {
        return NextResponse.json({ success: true, url: printData.invoice_url });
    }

    return NextResponse.json({ error: "Invoice URL not found in response" }, { status: 404 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
