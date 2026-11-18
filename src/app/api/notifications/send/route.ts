import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { memberScope } from "@/lib/auth-utils";
import { createAdminClient } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { notifyUser } from "@/lib/notifications-server";

const bodySchema = z.object({
  userId: z.string().uuid(),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  // In-app paths only ("/tasks?id=..."), so a notification can never point at another site.
  link: z.string().max(500).regex(/^\/(?!\/)/, "Link must be an in-app path").optional(),
  type: z.enum(["info", "success", "warning", "alert"]).optional(),
});

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, "notifications-send", 60, 60000);
  if (limited) return limited;

  const scope = await memberScope(req);
  if (scope.error) return scope.error;

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid notification payload" }, { status: 400 });
    }
    const { userId, title, body, link, type } = parsed.data;
    // A signed-in member may only notify people in their own workspace.
    if (scope.orgId) {
      const { data: target } = await createAdminClient().from("profiles").select("org_id").eq("id", userId).maybeSingle();
      if (!target || target.org_id !== scope.orgId) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
    }
    await notifyUser(userId, title, body, link, type);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[NOTIFICATIONS-SEND] Error:", err.message);
    return NextResponse.json({ error: "Could not send the notification" }, { status: 500 });
  }
}
