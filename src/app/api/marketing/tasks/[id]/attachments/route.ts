import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketing } from "@/lib/marketing-auth";

const BUCKET = "mkt-attachments";

const RecordSchema = z.object({
  file_name: z.string().min(1).max(400),
  storage_path: z.string().min(1).max(600),
  mime: z.string().max(200).optional(),
  size_bytes: z.number().int().nonnegative().optional(),
});

type Ctx = { params: { id: string } };

// GET /api/marketing/tasks/:id/attachments — rows + short-lived signed URLs
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const { data, error } = await supabase!
    .from("mkt_attachments")
    .select("*")
    .eq("task_id", params.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withUrls = await Promise.all(
    (data ?? []).map(async (a) => {
      const { data: signed } = await supabase!.storage.from(BUCKET).createSignedUrl(a.storage_path, 3600);
      return { ...a, url: signed?.signedUrl ?? null };
    })
  );
  return NextResponse.json(withUrls);
}

// POST /api/marketing/tasks/:id/attachments — record metadata after the
// client has uploaded the file to storage.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase, user } = await requireMarketing();
  if (errorResponse) return errorResponse;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = RecordSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("mkt_attachments")
    .insert({
      task_id: params.id,
      file_name: parsed.data.file_name,
      storage_path: parsed.data.storage_path,
      mime: parsed.data.mime ?? null,
      size_bytes: parsed.data.size_bytes ?? null,
      uploaded_by: user!.id,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// DELETE /api/marketing/tasks/:id/attachments?attachment_id=...
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { errorResponse, supabase } = await requireMarketing();
  if (errorResponse) return errorResponse;

  const attId = new URL(req.url).searchParams.get("attachment_id");
  if (!attId) return NextResponse.json({ error: "attachment_id required" }, { status: 400 });

  const { data: row, error: rowErr } = await supabase!
    .from("mkt_attachments")
    .select("id, storage_path")
    .eq("id", attId)
    .eq("task_id", params.id)
    .single();
  if (rowErr || !row) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  await supabase!.storage.from(BUCKET).remove([row.storage_path]);
  const { error } = await supabase!.from("mkt_attachments").delete().eq("id", attId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
