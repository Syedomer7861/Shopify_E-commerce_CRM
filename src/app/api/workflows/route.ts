import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
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

// The builder UI works with a flat `actions: [{type, params}]` array, but
// WorkflowEngine.trigger()/executeStep() (src/lib/workflow-engine.ts) only
// ever reads ordered rows from workflow_steps - a completely separate table
// from an earlier migration. Saving straight to `workflows.actions` (the
// original behavior here) meant every workflow built through this page was
// silently never executed. Steps live in workflow_steps; this is just the
// type-name translation between the two vocabularies.
const TYPE_TO_STEP: Record<string, string> = { create_task: "task", message: "message", delay: "delay" };
const TYPE_TO_ACTION: Record<string, string> = { task: "create_task", message: "message", delay: "delay" };

export async function GET(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const profile = await checkAuth(req);
  if (!hasPermission(profile, "manage_automations")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("workflows")
    .select("*, workflow_steps(*)")
    .order("created_at", { ascending: false })
    .order("step_order", { foreignTable: "workflow_steps", ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const workflows = (data || []).map((w: any) => ({
    ...w,
    actions: (w.workflow_steps || []).map((s: any) => ({ type: TYPE_TO_ACTION[s.type] || s.type, params: s.params || {} }))
  }));

  return NextResponse.json({ workflows });
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const profile = await checkAuth(req);
  if (!hasPermission(profile, "manage_automations")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const supabase = getSupabase();
  const body = await req.json();
  const { id, name, trigger_event, is_active, actions } = body;

  const { data: workflow, error } = await supabase
    .from("workflows")
    .upsert(id ? { id, name, trigger_event, is_active } : { name, trigger_event, is_active })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Replace steps wholesale - simplest way to keep step_order contiguous
  // after actions are added/removed/reordered in the builder.
  const { error: delErr } = await supabase.from("workflow_steps").delete().eq("workflow_id", workflow.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const stepRows = (actions || []).map((a: any, idx: number) => ({
    workflow_id: workflow.id,
    step_order: idx + 1,
    type: TYPE_TO_STEP[a.type] || a.type,
    params: a.params || {}
  }));

  if (stepRows.length > 0) {
    const { error: stepErr } = await supabase.from("workflow_steps").insert(stepRows);
    if (stepErr) return NextResponse.json({ error: stepErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, workflow });
}

export async function DELETE(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const profile = await checkAuth(req);
  if (!hasPermission(profile, "manage_automations")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  // workflow_steps/workflow_instances/workflow_logs all cascade on workflow_id.
  const { error } = await supabase.from("workflows").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
