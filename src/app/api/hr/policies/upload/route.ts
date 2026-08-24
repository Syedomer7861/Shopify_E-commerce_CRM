import { NextRequest, NextResponse } from "next/server";
import { requireInternal, hasInternalSecret, getAuthenticatedSession } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The Policy Library's upload dropzone had no file input or handler at
 * all - "Add to Library" only ever saved a name/category as text, even
 * though hr_policies already has file_url/file_size columns waiting.
 * This is the actual upload: Supabase Storage, same pattern already used
 * for call recordings (calls/upload/route.ts).
 */
export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  if (!hasInternalSecret(req)) {
    const { profile } = await getAuthenticatedSession();
    if (profile?.role !== "admin" && profile?.role !== "hr") {
      return NextResponse.json({ error: "Forbidden: Admin or HR access required" }, { status: 403 });
    }
  }

  const supabase = createServerClient();

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const name = formData.get("name") as string;
    const category = formData.get("category") as string;

    if (!name || !category) {
      return NextResponse.json({ error: "Name and category are required" }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Only PDF, DOC, and DOCX files are supported" }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "File exceeds the 10MB limit" }, { status: 400 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `policies/${Date.now()}_${safeName}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("hr-policies")
      .upload(path, arrayBuffer, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from("hr-policies").getPublicUrl(path);

    const { data: row, error: insertError } = await supabase
      .from("hr_policies")
      .insert([{ name, category, file_url: publicUrl, file_size: formatSize(file.size) }])
      .select()
      .single();
    if (insertError) throw insertError;

    return NextResponse.json(row);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
