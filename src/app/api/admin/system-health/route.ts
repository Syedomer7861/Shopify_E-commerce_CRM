import { NextResponse } from "next/server";
import { ensureAdmin } from "@/lib/auth-utils";
import { getSystemSettings, getShiprocketToken, getShopifyAccessToken } from "@/lib/server-settings";

type CheckStatus = "ok" | "error" | "not_configured" | "stale" | "info";
interface Check {
  key: string;
  label: string;
  category: string;
  status: CheckStatus;
  message: string;
  latencyMs?: number;
  meta?: Record<string, any>;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result?: T; error?: any; ms: number }> {
  const t0 = Date.now();
  try {
    const result = await fn();
    return { result, ms: Date.now() - t0 };
  } catch (error) {
    return { error, ms: Date.now() - t0 };
  }
}

/**
 * Real, live checks against real infrastructure - not decorative uptime
 * numbers. Every check either genuinely calls the service or genuinely
 * inspects real data (webhook_logs, env presence). No invented percentages.
 */
export async function GET() {
  const { errorResponse, supabase } = await ensureAdmin();
  if (errorResponse) return errorResponse;

  const checks: Check[] = [];

  // ── Database ──────────────────────────────────────────────────────────
  {
    const { error, ms } = await timed(async () => {
      const { error } = await supabase!.from("settings").select("id").limit(1);
      if (error) throw error;
    });
    checks.push({
      key: "database", label: "Supabase Database", category: "Backend",
      status: error ? "error" : "ok",
      message: error ? String(error.message || error) : `Round-trip ok`,
      latencyMs: ms,
    });
  }

  const settings = await getSystemSettings(supabase!);

  // ── Shopify ───────────────────────────────────────────────────────────
  {
    if (!settings?.shopify_store_domain) {
      checks.push({ key: "shopify", label: "Shopify Admin API", category: "Integrations", status: "not_configured", message: "No store domain configured" });
    } else {
      const { result, error, ms } = await timed(async () => {
        const domain = String(settings.shopify_store_domain).replace(/^https?:\/\//, "").replace(/\/$/, "");
        const token = await getShopifyAccessToken(supabase!);
        const res = await fetch(`https://${domain}/admin/api/2024-04/shop.json`, {
          headers: { "X-Shopify-Access-Token": token },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return json?.shop?.name || domain;
      });
      checks.push({
        key: "shopify", label: "Shopify Admin API", category: "Integrations",
        status: error ? "error" : "ok",
        message: error ? String((error as any).message || error) : `Connected to ${result}`,
        latencyMs: ms,
      });
    }
  }

  // ── Shiprocket ────────────────────────────────────────────────────────
  {
    const { error, ms } = await timed(() => getShiprocketToken(supabase!));
    const notConfigured = error && String((error as any).message || "").includes("credentials missing");
    checks.push({
      key: "shiprocket", label: "Shiprocket API", category: "Integrations",
      status: notConfigured ? "not_configured" : error ? "error" : "ok",
      message: notConfigured ? "No Shiprocket credentials configured" : error ? String((error as any).message || error) : "Token valid",
      latencyMs: notConfigured ? undefined : ms,
    });
  }

  // ── WhatsApp Meta Cloud API ───────────────────────────────────────────
  {
    if (!settings?.whatsapp_token || !settings?.whatsapp_phone_id) {
      checks.push({ key: "whatsapp_meta", label: "WhatsApp Meta Cloud API", category: "Integrations", status: "not_configured", message: "Token or Phone Number ID not set" });
    } else {
      const { error, ms } = await timed(async () => {
        const res = await fetch(`https://graph.facebook.com/v18.0/${settings.whatsapp_phone_id}?fields=id`, {
          headers: { Authorization: `Bearer ${settings.whatsapp_token}` },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      });
      checks.push({
        key: "whatsapp_meta", label: "WhatsApp Meta Cloud API", category: "Integrations",
        status: error ? "error" : "ok",
        message: error ? String((error as any).message || error) : "Token valid",
        latencyMs: ms,
      });
    }
  }

  // ── WhatsApp Bridge (local wa_server.js) ─────────────────────────────
  {
    const bridgeUrl = process.env.WHATSAPP_BRIDGE_URL || settings?.whatsapp_bridge_url || "http://127.0.0.1:3001";
    const { result, error, ms } = await timed(async () => {
      const res = await fetch(`${bridgeUrl}/status`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
    checks.push({
      key: "whatsapp_bridge", label: "WhatsApp Bridge (wa_server.js)", category: "Integrations",
      status: error ? "error" : (result as any)?.ready ? "ok" : "error",
      message: error ? "Unreachable - bridge process not running or not exposed to this deployment" : (result as any)?.ready ? "Connected" : "Bridge reachable but not authenticated",
      latencyMs: ms,
    });
  }

  // ── Gmail ─────────────────────────────────────────────────────────────
  {
    if (!settings?.gmail_refresh_token) {
      checks.push({ key: "gmail", label: "Gmail (Google OAuth)", category: "Integrations", status: "not_configured", message: "No refresh token configured" });
    } else {
      const { error, ms } = await timed(async () => {
        const { getGmailClient } = await import("@/lib/gmail");
        const client = await getGmailClient();
        await client.getAccessToken();
      });
      checks.push({
        key: "gmail", label: "Gmail (Google OAuth)", category: "Integrations",
        status: error ? "error" : "ok",
        message: error ? String((error as any).message || error) : "Refresh token valid",
        latencyMs: ms,
      });
    }
  }

  // ── Telephony ─────────────────────────────────────────────────────────
  {
    if (settings?.telephony_provider === "twilio" && settings?.twilio_account_sid && settings?.twilio_auth_token) {
      const { error, ms } = await timed(async () => {
        const auth = Buffer.from(`${settings.twilio_account_sid}:${settings.twilio_auth_token}`).toString("base64");
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${settings.twilio_account_sid}.json`, {
          headers: { Authorization: `Basic ${auth}` },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      });
      checks.push({
        key: "telephony", label: "Telephony (Twilio)", category: "Integrations",
        status: error ? "error" : "ok",
        message: error ? String((error as any).message || error) : "Account credentials valid",
        latencyMs: ms,
      });
    } else if (settings?.telephony_provider === "exotel" && settings?.exotel_sid && settings?.exotel_token) {
      checks.push({ key: "telephony", label: "Telephony (Exotel)", category: "Integrations", status: "info", message: "Credentials present - not live-verified (no safe no-op Exotel endpoint used)" });
    } else {
      checks.push({ key: "telephony", label: "Telephony", category: "Integrations", status: "not_configured", message: `Provider: ${settings?.telephony_provider || "none"}` });
    }
  }

  // ── Chat server (separate self-hosted process, no health endpoint) ──
  checks.push({ key: "chat_server", label: "Chat Server (chat_server.js)", category: "Integrations", status: "info", message: "Self-hosted process - not monitored from this dashboard" });

  // ── Cron / webhook freshness ──────────────────────────────────────────
  {
    const { data: recentLogs } = await supabase!
      .from("webhook_logs")
      .select("source, status, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    const bySource: Record<string, { last: string; failedRecent: number; total: number }> = {};
    (recentLogs || []).forEach((l: any) => {
      if (!bySource[l.source]) bySource[l.source] = { last: l.created_at, failedRecent: 0, total: 0 };
      bySource[l.source].total++;
      if (l.status === "failed") bySource[l.source].failedRecent++;
    });

    const STALE_MS = 6 * 60 * 60 * 1000; // 6h - covers the slowest (sixhourly) cron group with headroom
    for (const source of ["shopify", "shiprocket"]) {
      const s = bySource[source];
      if (!s) {
        checks.push({ key: `cron_${source}`, label: `${source[0].toUpperCase()}${source.slice(1)} Webhooks/Sync`, category: "Cron Jobs", status: "info", message: "No webhook activity recorded yet" });
        continue;
      }
      const ageMs = Date.now() - new Date(s.last).getTime();
      const isStale = ageMs > STALE_MS;
      checks.push({
        key: `cron_${source}`, label: `${source[0].toUpperCase()}${source.slice(1)} Webhooks/Sync`, category: "Cron Jobs",
        status: isStale ? "stale" : "ok",
        message: `Last event ${Math.round(ageMs / 60000)}m ago${s.failedRecent > 0 ? ` - ${s.failedRecent}/${s.total} recent failed` : ""}`,
        meta: { lastEventAt: s.last },
      });
    }
  }

  // ── Supabase plan quota (the walls that take the app down) ───────────
  const MB = 1024 * 1024;
  const DB_LIMIT = 500 * MB; // Free plan
  {
    const { result, error } = await timed(async () => {
      const { data, error } = await supabase!.rpc("db_size_stats");
      if (error) throw error;
      return data as { db_bytes: number; tables: Array<{ name: string; bytes: number }> };
    });
    if (error) {
      checks.push({ key: "quota_db", label: "Database Size", category: "Quota", status: "info", message: "db_size_stats() not available - apply migration 20260831a" });
    } else {
      const bytes = Number(result!.db_bytes || 0);
      const pct = Math.round((bytes / DB_LIMIT) * 100);
      checks.push({
        key: "quota_db", label: "Database Size", category: "Quota",
        status: pct >= 90 ? "error" : pct >= 75 ? "stale" : "ok",
        message: `${(bytes / MB).toFixed(0)} MB of ${(DB_LIMIT / MB).toFixed(0)} MB (${pct}%)` +
          (result!.tables?.[0] ? ` · biggest: ${result!.tables[0].name} ${(result!.tables[0].bytes / MB).toFixed(0)} MB` : ""),
        meta: { pct, bytes, tables: result!.tables?.slice(0, 5) },
      });
    }
  }
  {
    const { result, error } = await timed(async () => {
      const { data, error } = await supabase!.rpc("realtime_status");
      if (error) throw error;
      return data as { count: number; tables: string[] };
    });
    if (error) {
      checks.push({ key: "quota_realtime", label: "Realtime Publication", category: "Quota", status: "info", message: "realtime_status() not available - apply migration 20260831g" });
    } else {
      checks.push({
        key: "quota_realtime", label: "Realtime Publication", category: "Quota",
        status: (result!.count ?? 0) > 6 ? "stale" : "ok",
        message: `${result!.count} table(s) broadcasting: ${(result!.tables || []).join(", ") || "none"}`,
        meta: { tables: result!.tables },
      });
    }
  }
  {
    const { data: snap } = await supabase!
      .from("egress_watch")
      .select("captured_at, db_bytes, note")
      .order("captured_at", { ascending: false })
      .limit(1);
    const row = snap?.[0];
    if (!row) {
      checks.push({ key: "quota_egress_watch", label: "Egress Watch Snapshot", category: "Quota", status: "info", message: "No snapshot yet - cron /api/cron/egress-watch has not run" });
    } else {
      const ageH = (Date.now() - new Date(row.captured_at).getTime()) / 3_600_000;
      checks.push({
        key: "quota_egress_watch", label: "Egress Watch Snapshot", category: "Quota",
        status: row.note ? "stale" : ageH > 30 ? "stale" : "ok",
        message: row.note ? String(row.note) : `Last snapshot ${ageH < 1 ? "<1" : Math.round(ageH)}h ago · no alerts`,
        meta: { capturedAt: row.captured_at },
      });
    }
  }

  // ── Work queue depth ────────────────────────────────────────────────
  {
    const today = new Date().toISOString().split("T")[0];
    const [overdue, pending, failedWh] = await Promise.all([
      supabase!.from("tasks").select("id", { count: "exact", head: true }).lt("due_date", today).not("status", "in", '("done","cancelled","skipped")'),
      supabase!.from("tasks").select("id", { count: "exact", head: true }).eq("due_date", today).not("status", "in", '("done","cancelled","skipped")'),
      supabase!.from("webhook_logs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", new Date(Date.now() - 86_400_000).toISOString()),
    ]);
    const oc = overdue.count ?? 0;
    checks.push({
      key: "queue_overdue", label: "Overdue Tasks", category: "Queue",
      status: oc > 5000 ? "error" : oc > 1000 ? "stale" : "ok",
      message: `${oc.toLocaleString()} open past due · ${pending.count ?? 0} due today`,
      meta: { overdue: oc, dueToday: pending.count ?? 0 },
    });
    const fc = failedWh.count ?? 0;
    checks.push({
      key: "queue_webhooks", label: "Failed Webhooks (24h)", category: "Queue",
      status: fc > 100 ? "error" : fc > 10 ? "stale" : "ok",
      message: fc === 0 ? "None in the last 24h" : `${fc} failed webhook(s) in the last 24h`,
      meta: { failed24h: fc },
    });
  }

  // ── Deployment (informational) ──────────────────────────────────────
  {
    const sha = process.env.VERCEL_GIT_COMMIT_SHA;
    checks.push({
      key: "deploy_build", label: "Deployment", category: "Deployment", status: "info",
      message: sha
        ? `${(process.env.VERCEL_ENV || "unknown")} · ${process.env.VERCEL_GIT_COMMIT_REF || "?"} @ ${sha.slice(0, 7)} · ${process.env.VERCEL_REGION || "?"}`
        : "Not running on Vercel (local or self-hosted)",
      meta: { sha, ref: process.env.VERCEL_GIT_COMMIT_REF, env: process.env.VERCEL_ENV, region: process.env.VERCEL_REGION },
    });
  }

  // ── Environment secrets presence (booleans only, never values) ───────
  const envChecks: Array<{ key: string; label: string; required?: boolean }> = [
    { key: "CRON_SECRET", label: "CRON_SECRET", required: true },
    { key: "SUPABASE_SERVICE_ROLE_KEY", label: "SUPABASE_SERVICE_ROLE_KEY", required: true },
    { key: "NEXT_PUBLIC_SUPABASE_URL", label: "NEXT_PUBLIC_SUPABASE_URL", required: true },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", label: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true },
    { key: "SYNC_SECRET", label: "SYNC_SECRET" },
    { key: "GOOGLE_CLIENT_ID", label: "GOOGLE_CLIENT_ID" },
    { key: "GOOGLE_CLIENT_SECRET", label: "GOOGLE_CLIENT_SECRET" },
    { key: "GOOGLE_DRIVE_FOLDER_ID", label: "GOOGLE_DRIVE_FOLDER_ID" },
    { key: "WHATSAPP_BRIDGE_URL", label: "WHATSAPP_BRIDGE_URL" },
  ];
  for (const e of envChecks) {
    const set = !!process.env[e.key];
    checks.push({
      key: `env_${e.key}`, label: e.label, category: "Environment",
      status: set ? "ok" : e.required ? "error" : "info",
      message: set ? "Set" : e.required ? "Missing - required for production" : "Not set (optional)",
    });
  }

  const summary = {
    ok: checks.filter(c => c.status === "ok").length,
    error: checks.filter(c => c.status === "error").length,
    stale: checks.filter(c => c.status === "stale").length,
    not_configured: checks.filter(c => c.status === "not_configured").length,
    info: checks.filter(c => c.status === "info").length,
    total: checks.length,
  };

  return NextResponse.json({ checks, summary, checkedAt: new Date().toISOString() });
}
