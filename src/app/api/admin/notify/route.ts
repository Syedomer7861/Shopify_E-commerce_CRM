import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { notifyAdmin } from "@/lib/notifications-server";
import { createServerClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

    try {
        const { message, type, action } = await req.json();
        
        // Basic security: Check if a user is logged in
        const supabase = createServerClient();
        
        const authHeader = req.headers.get("Authorization");
        if (authHeader) {
            const token = authHeader.replace("Bearer ", "");
            const { data: { user } } = await supabase.auth.getUser(token);
            if (!user) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
        }

        await notifyAdmin(message, (type || "info") as any, action);
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
