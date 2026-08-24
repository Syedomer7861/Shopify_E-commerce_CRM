import { sendWhatsApp, personaliseTemplate, getTemplateVariables } from "@/lib/whatsapp";

/**
 * Shared by the manual "Run Now" action and the campaign-sender cron so both
 * populate recipients the same way. Previously this list lived in a local
 * JSON file that doesn't survive across Vercel invocations - now it's rows
 * in campaign_recipients so a send loop can resume across cron ticks.
 */
export async function populateRecipients(supabase: any, campaignId: string, targetSegment: string) {
  let query = supabase.from("customers").select("id, name, phone, segment");
  if (targetSegment && targetSegment !== "all") {
    query = query.eq("segment", targetSegment);
  }
  const { data: customers, error } = await query;
  if (error) throw error;

  const recipients = (customers || []).filter((c: any) => c.phone).map((c: any) => ({
    campaign_id: campaignId,
    customer_id: c.id,
    name: c.name || "Unknown Customer",
    phone: c.phone,
    status: "pending"
  }));

  if (recipients.length > 0) {
    const { error: insErr } = await supabase.from("campaign_recipients").insert(recipients);
    if (insErr) throw insErr;
  }

  return recipients.length;
}

/** Flips due scheduled campaigns to running and seeds their recipients. */
export async function launchScheduledCampaigns(supabase: any) {
  const { data: due } = await supabase
    .from("campaigns")
    .select("id, target_segment")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString());

  for (const campaign of due || []) {
    const count = await populateRecipients(supabase, campaign.id, campaign.target_segment);
    await supabase
      .from("campaigns")
      .update({ status: "running", total_recipients: count, delivered_count: 0, failed_count: 0 })
      .eq("id", campaign.id);
  }

  return (due || []).length;
}

function withinSendWindow(startHHMM: string, endHHMM: string): boolean {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = (startHHMM || "09:00").split(":").map(Number);
  const [eh, em] = (endHHMM || "21:00").split(":").map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  if (startMinutes <= endMinutes) return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  return nowMinutes >= startMinutes || nowMinutes <= endMinutes; // overnight window
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Sends pending recipients for every running campaign until either every
 * campaign is drained or deadlineMs is reached, whichever comes first. Meant
 * to be called both right after "Run Now" (short budget, for instant
 * feedback) and from the campaign-sender cron (longer budget, resumes what
 * the last tick didn't finish - Vercel kills anything mid-loop past the
 * function limit, so this has to be safe to stop and resume at any point).
 */
export async function processCampaignSends(supabase: any, deadlineMs: number) {
  let sent = 0;

  const { data: running } = await supabase
    .from("campaigns")
    .select("*, template:campaign_templates(*)")
    .eq("status", "running");

  for (const campaign of running || []) {
    if (Date.now() >= deadlineMs) break;
    if (!withinSendWindow(campaign.send_window_start, campaign.send_window_end)) continue;

    if (!campaign.template?.body) {
      await supabase.from("campaigns").update({ status: "failed" }).eq("id", campaign.id);
      continue;
    }

    let deliveredCount = campaign.delivered_count || 0;
    let failedCount = campaign.failed_count || 0;

    while (Date.now() < deadlineMs) {
      const { data: recipient } = await supabase
        .from("campaign_recipients")
        .select("*")
        .eq("campaign_id", campaign.id)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();

      if (!recipient) {
        await supabase.from("campaigns").update({ status: "completed" }).eq("id", campaign.id);
        break;
      }

      const variables = getTemplateVariables({ name: recipient.name, phone: recipient.phone });
      const message = personaliseTemplate(campaign.template.body, variables);

      try {
        const result = await sendWhatsApp(recipient.phone, message);
        if (result.ok) {
          deliveredCount++;
          await supabase.from("campaign_recipients").update({ status: "delivered", sent_at: new Date().toISOString() }).eq("id", recipient.id);
        } else {
          failedCount++;
          await supabase.from("campaign_recipients").update({ status: "failed", error: result.error || "Meta/Bridge rejected message", sent_at: new Date().toISOString() }).eq("id", recipient.id);
        }
      } catch (err: any) {
        failedCount++;
        await supabase.from("campaign_recipients").update({ status: "failed", error: err.message || "Network exception", sent_at: new Date().toISOString() }).eq("id", recipient.id);
      }

      sent++;
      await supabase.from("campaigns").update({ delivered_count: deliveredCount, failed_count: failedCount }).eq("id", campaign.id);

      const delayMs = Math.floor(Math.random() * ((campaign.max_delay || 90) - (campaign.min_delay || 30) + 1) + (campaign.min_delay || 30)) * 1000;
      const remaining = deadlineMs - Date.now();
      if (remaining <= 0) break;
      await sleep(Math.min(delayMs, remaining));
    }
  }

  return sent;
}
