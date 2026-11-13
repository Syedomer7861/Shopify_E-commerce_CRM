import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requirePlatformOwner } from "@/lib/auth-utils";
import { SITE_CONTENT_TAG } from "@/lib/site-content-server";

// Called by Super Admin > Content right after a publish or rollback so the
// public pages show it now instead of within 5 minutes. Owner + two-factor only.
export async function POST() {
  const { errorResponse } = await requirePlatformOwner();
  if (errorResponse) return errorResponse;
  revalidateTag(SITE_CONTENT_TAG);
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
