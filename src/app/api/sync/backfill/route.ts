import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

const supabase = createServerClient();

async function getShiprocketToken(): Promise<string | null> {
  try {
    const res = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: process.env.SHIPROCKET_EMAIL,
        password: process.env.SHIPROCKET_PASSWORD,
      }),
    });
    const data = await res.json();
    return data.token || null;
  } catch (err: any) {
    console.error("Shiprocket Login Error:", err);
    return null;
  }
}

async function getPhoneFromShiprocket(
  orderNumber: string,
  token: string
): Promise<string | null> {
  try {
    await new Promise((r) => setTimeout(r, 500)); // rate limit protection
    const res = await fetch(
      `https://apiv2.shiprocket.in/v1/external/orders/show/${orderNumber}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    const d = data.data || data;
    const phone =
      d?.billing_customer_phone ||
      d?.customer_phone ||
      d?.billing_address?.phone ||
      d?.shipping_address?.phone ||
      null;
    if (phone && !String(phone).includes("X") && String(phone).length >= 10) {
      return String(phone).trim();
    }
    return null;
  } catch {
    return null;
  }
}

function isRealPhone(phone: any): boolean {
  if (!phone) return false;
  const p = String(phone).trim();
  return (
    p.length >= 10 &&
    !p.includes("X") &&
    !p.includes("x") &&
    !p.includes("_SR_") &&
    !p.startsWith("noreply")
  );
}

export async function POST(req: NextRequest) {
  let unmasked = 0;
  let skipped = 0;
  let failed = 0;
  let duplicates = 0;
  const log: string[] = [];

  try {
    // Get all masked customers
    const { data: maskedCustomers, error } = await supabase
      .from("customers")
      .select("id, name, phone, email")
      .or("phone.like.%_SR_%, phone.like.%xxxxxxxxx%");

    if (error) throw error;
    log.push(`Found ${maskedCustomers?.length ?? 0} masked customers`);

    // Get Shiprocket token
    const token = await getShiprocketToken();
    if (!token) {
      log.push("⚠️ Shiprocket login failed — will only use webhook logs");
    } else {
      log.push("✅ Shiprocket token obtained");
    }

    // Process each masked customer
    for (const customer of maskedCustomers ?? []) {
      let realPhone: string | null = null;

      // Try Shiprocket API using SR order number from masked phone
      if (token && customer.phone?.includes("_SR_")) {
        const srNumber = customer.phone.split("_SR_")[1];
        if (srNumber) {
          realPhone = await getPhoneFromShiprocket(srNumber, token);
          if (realPhone) log.push(`📞 SR API: ${customer.name} → ${realPhone}`);
        }
      }

      if (!realPhone) { skipped++; continue; }

      // Check for duplicates before updating
      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", realPhone)
        .neq("id", customer.id)
        .maybeSingle();

      if (existing) {
        duplicates++;
        log.push(`⚠️ Duplicate: ${customer.name} → ${realPhone} already exists`);
        continue;
      }

      // Update the customer
      const { error: updateError } = await supabase
        .from("customers")
        .update({ phone: realPhone, updated_at: new Date().toISOString() })
        .eq("id", customer.id);

      if (updateError) {
        failed++;
        log.push(`❌ Failed: ${customer.name} → ${updateError.message}`);
      } else {
        unmasked++;
      }
    }

    return NextResponse.json({
      success: true,
      unmasked,
      skipped,
      duplicates,
      failed,
      total_masked: maskedCustomers?.length ?? 0,
      log: log.slice(0, 50), // limit log size
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}