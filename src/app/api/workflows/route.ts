import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

function getSupabase() {
  return createServerClient();
}

async function checkAuth(req: NextRequest) {
  const supabase = createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;

  if (!user) return null;

  const adminClient = getSupabase();
  const { data: profile } = await adminClient
    .from("profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .single();

  return profile;
}

function hasPermission(profile: any, permission: string) {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  return profile.permissions?.[permission] === true;
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workflows: data });
}

export async function POST(req: NextRequest) {
  const profile = await checkAuth(req);
  if (!hasPermission(profile, "manage_automations")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const supabase = getSupabase();
  const body = await req.json();
  const { data, error } = await supabase
    .from("workflows")
    .upsert(body)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, workflow: data });
}

export async function DELETE(req: NextRequest) {
  const profile = await checkAuth(req);
  if (!hasPermission(profile, "manage_automations")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const { error } = await supabase.from("workflows").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
