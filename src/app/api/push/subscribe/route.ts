import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedSession } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "push-subscribe", 20, 60000);
  if (limited) return limited;

  const { errorResponse, user, supabase } = await getAuthenticatedSession();
  if (errorResponse) return errorResponse;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
  }
  const { endpoint, keys } = parsed.data;

  // RLS (push_subscriptions_insert_own) requires auth.uid() = user_id, so
  // this runs on the caller's own session client, not the admin client -
  // an agent can only ever subscribe themselves. ignoreDuplicates (DO
  // NOTHING, not DO UPDATE) matters: there's no update policy on this
  // table, so an ON CONFLICT UPDATE would be rejected by RLS - re-
  // subscribing the same browser/endpoint is just a harmless no-op.
  const { error } = await supabase!.from("push_subscriptions").upsert(
    { user_id: user!.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: "endpoint", ignoreDuplicates: true }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
