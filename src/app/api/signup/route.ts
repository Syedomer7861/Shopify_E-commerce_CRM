import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// Public signup: creates a new organization + its first admin. Mirrors
// src/app/actions/admin.ts's service-role pattern for employee creation,
// but with no caller-auth gate - this route IS the public entry point.

const SignupSchema = z.object({
  orgName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(6).max(72),
});

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "org";
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = SignupSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const { orgName, name, email, password } = parsed.data;

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Find a unique slug (base, then base-2, base-3, ...).
  const base = slugify(orgName);
  let slug = base;
  for (let i = 2; i <= 50; i++) {
    const { data: existing } = await supabaseAdmin.from("organizations").select("id").eq("slug", slug).maybeSingle();
    if (!existing) break;
    slug = `${base}-${i}`;
  }

  const { data: org, error: orgError } = await supabaseAdmin
    .from("organizations")
    .insert({ name: orgName, slug })
    .select("id")
    .single();
  if (orgError || !org) {
    return NextResponse.json({ error: orgError?.message || "Failed to create organization" }, { status: 500 });
  }

  const { data: created, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role: "admin", org_id: org.id },
  });
  if (userError || !created.user) {
    // Roll back the org so a failed signup doesn't leave an orphaned, empty one behind.
    await supabaseAdmin.from("organizations").delete().eq("id", org.id);
    return NextResponse.json({ error: userError?.message || "Failed to create account" }, { status: 500 });
  }

  return NextResponse.json({ success: true, orgId: org.id, slug }, { status: 201 });
}
