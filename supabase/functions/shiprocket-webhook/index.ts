// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts"

const WEBHOOK_SECRET = Deno.env.get("SHIPROCKET_WEBHOOK_SECRET") || "cureforeever_shiprocket_sync_2026"

Deno.serve(async (req: any) => {
  // Verify secret header
  const secret = req.headers.get("x-shiprocket-secret")
  if (secret !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 })
  }

  let payload: any = {}
  try {
    payload = await req.json()
  } catch {
    return new Response("Invalid JSON", { status: 400 })
  }

  // @ts-ignore
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2")

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  // Extract from all possible Shiprocket payload locations
  const rawPhone =
    payload?.customer_phone ||
    payload?.billing_address?.phone ||
    payload?.phone ||
    payload?.mobile ||
    null

  const rawEmail =
    payload?.customer_email ||
    payload?.billing_address?.email ||
    payload?.email ||
    null

  const rawName =
    payload?.customer_name ||
    payload?.billing_address?.name ||
    payload?.name ||
    null

  const isReal = rawPhone &&
    !String(rawPhone).includes("X") &&
    !String(rawPhone).includes("x") &&
    String(rawPhone).length >= 10

  // Always log raw webhook
  await supabase.from("webhook_logs").insert({
    source: "shiprocket_checkout",
    payload: payload,
    phone_extracted: rawPhone,
    email_extracted: rawEmail,
    created_at: new Date().toISOString()
  })

  // Update customer if real phone found
  if (isReal && rawEmail) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id, phone")
      .eq("email", rawEmail)
      .maybeSingle()

    if (existing) {
      await supabase
        .from("customers")
        .update({
          phone: rawPhone,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id)
    } else {
      await supabase.from("customers").insert({
        email: rawEmail,
        phone: rawPhone,
        name: rawName,
        source: "shiprocket_checkout",
        created_at: new Date().toISOString()
      })
    }
  }

  return new Response(
    JSON.stringify({ success: true, phone_received: !!isReal }),
    { headers: { "Content-Type": "application/json" } }
  )
})