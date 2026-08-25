import { NextRequest, NextResponse } from "next/server";
import { requireInternal, hasInternalSecret, getAuthenticatedSession } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  // leaves RLS already scopes a plain agent's count to their own rows only,
  // so this was never a real data leak - but the badge this feeds is
  // admin/hr-only UI, so make the endpoint honest about who it's for.
  if (!hasInternalSecret(req)) {
    const { profile } = await getAuthenticatedSession();
    if (profile?.role !== "admin" && profile?.role !== "hr") {
      return NextResponse.json({ error: "Forbidden: Admin or HR access required" }, { status: 403 });
    }
  }

  const supabase = createServerClient();

  try {
    const { count, error } = await supabase
      .from("leaves")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    if (error) throw error;

    return NextResponse.json({ count: count || 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
