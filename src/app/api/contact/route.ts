import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rate-limit";
import { AttributionSchema } from "@/lib/attribution";

// Public, unauthenticated endpoint (the whole point - there's no org/session
// yet). Service-role write only; no anon INSERT policy exists on
// contact_requests (see 20261106d_contact_requests.sql), so this is the
// only path in.
const ContactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  company: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  message: z.string().trim().min(1).max(4000),
  // Sent only after analytics consent; a malformed value is dropped, never blocks the request.
  attribution: z.unknown().optional(),
});

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, "contact", 5, 60_000);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = ContactSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { attribution, ...fields } = parsed.data;
  const touches = AttributionSchema.safeParse(attribution);
  let { error } = await supabaseAdmin.from("contact_requests").insert(
    touches.success ? { ...fields, first_touch: touches.data.first, last_touch: touches.data.last } : fields
  );
  // Attribution must never cost a lead: if its columns are missing or reject it, save the request without it.
  if (error && touches.success) ({ error } = await supabaseAdmin.from("contact_requests").insert(fields));
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
