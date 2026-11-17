import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession } from "@/lib/auth-utils";
import { rateLimit } from "@/lib/rate-limit";
import { getDevFeed } from "@/lib/dev-tools";

export const dynamic = "force-dynamic";

/** Live developer feed for the caller's own org. Display data only, never tokens. */
export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, "devtools-feed", 30, 60_000);
  if (limited) return limited;
  const { errorResponse, profile } = await getAuthenticatedSession();
  if (errorResponse) return errorResponse;
  if (!profile?.org_id || profile.is_active === false) return NextResponse.json({ connected: [] });
  return NextResponse.json(await getDevFeed(profile.org_id));
}
