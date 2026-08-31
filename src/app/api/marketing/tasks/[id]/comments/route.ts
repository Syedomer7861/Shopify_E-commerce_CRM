import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing } from "@/lib/marketing-auth";
import { notifyUser } from "@/lib/notifications-server";

const CreateCommentSchema = z.object({
  body: z.string().min(1).max(10000),
  mentions: z.array(z.string().uuid()).optional(),
});

type Ctx = { params: { id: string } };

// GET /api/marketing/tasks/:id/comments
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const { data, error } = await supabase!
    .from("mkt_comments")
    .select("*, author:profiles(id, name, email, role)")
    .eq("task_id", params.id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/marketing/tasks/:id/comments — add comment, notify mentions + watchers
export async function POST(req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase, user, profile } = await requireMarketing();
  if (errorResponse) return errorResponse;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = CreateCommentSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const mentions = parsed.data.mentions ?? [];

  const { data: task, error: taskErr } = await supabase!
    .from("mkt_tasks")
    .select("id, title, watchers, assignees")
    .eq("id", params.id)
    .single();
  if (taskErr || !task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const { data: comment, error } = await supabase!
    .from("mkt_comments")
    .insert({ task_id: params.id, author_id: user!.id, body: parsed.data.body, mentions })
    .select("*, author:profiles(id, name, email, role)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fan out: mentions + watchers, minus the author. Best-effort.
  const recipients = Array.from(
    new Set<string>([...mentions, ...((task.watchers as string[]) ?? [])])
  ).filter((id) => id && id !== user!.id);
  const who = profile?.name || profile?.email || "Someone";
  await Promise.allSettled(
    recipients.map((uid) =>
      notifyUser(
        uid,
        `${who} commented on "${task.title}"`,
        parsed.data.body.slice(0, 140),
        `/marketing?task=${params.id}`,
        "info"
      )
    )
  );

  return NextResponse.json(comment, { status: 201 });
}
