import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireOwnerOrInternal } from "@/lib/auth-utils";
import { launchScheduledCampaigns, processCampaignSends } from "@/lib/campaign-engine";

/**
 * Drives running/scheduled campaigns forward. Sending up to 1000 recipients
 * with a 30-120s anti-ban delay between each can't finish inside one Vercel
 * invocation, so this runs every 15 min (the "frequent" cron group) and
 * each tick just picks up wherever the last one left off - same pattern as
 * every other long-running job in this app (see .github/workflows/cron.yml).
 */
export async function POST(req: NextRequest) {
  const unauthorized = await requireOwnerOrInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const deadline = Date.now() + 50_000; // stay under the ~60s Hobby ceiling

  const launched = await launchScheduledCampaigns(supabase);
  const sent = await processCampaignSends(supabase, deadline);

  return NextResponse.json({ launched, sent });
}

export const GET = POST;
