import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedSession } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({ endpoint: z.string().url() });

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, "push-unsubscribe", 20, 60000);
  if (limited) return limited;

  const { errorResponse, supabase } = await getAuthenticatedSession();
  if (errorResponse) return errorResponse;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // RLS (push_subscriptions_delete_own) already scopes this to the
  // caller's own rows - no need to also filter by user_id here.
  const { error } = await supabase!.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
