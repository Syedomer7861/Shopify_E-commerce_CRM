import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternal } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";
import { notifyUser } from "@/lib/notifications-server";

const bodySchema = z.object({
  userId: z.string().uuid(),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  link: z.string().max(500).optional(),
  type: z.enum(["info", "success", "warning", "alert"]).optional(),
});

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "notifications-send", 60, 60000);
  if (limited) return limited;

  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid notification payload" }, { status: 400 });
    }
    const { userId, title, body, link, type } = parsed.data;
    await notifyUser(userId, title, body, link, type);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[NOTIFICATIONS-SEND] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
