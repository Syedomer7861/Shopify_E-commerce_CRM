/** @deprecated settings is now one row per org (org_id), not a single fixed row. Kept only so nothing crashes on an old import. */
const SETTINGS_ID = "00000000-0000-0000-0000-000000000000";

export { SETTINGS_ID };

/**
 * The settings row is ~100 columns (every secret + every WhatsApp/email
 * template) and was re-read from the DB on every cron tick, webhook, and
 * many API routes — several times per invocation once token helpers are
 * counted. It changes rarely, so a short in-process memo cuts most of that
 * egress. Per serverless instance AND per org now (a shared single-entry
 * cache would leak one org's settings into another org's requests on the
 * same warm instance); a config change reaches background jobs within
 * TTL_MS (or immediately via clearSettingsCache() on write).
 */
const SETTINGS_TTL_MS = 60_000;
const _settingsCache = new Map<string, { at: number; data: any }>();

/** Drop the memo so the next read hits the DB. Call after any settings write. Omit orgId to clear every org's memo. */
export function clearSettingsCache(orgId?: string) {
  if (orgId) _settingsCache.delete(orgId);
  else _settingsCache.clear();
}

function getAdminClient() {
  // Lazy require avoids a circular import at module load time.
  const { createClient } = require("@supabase/supabase-js");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

let _defaultOrgIdCache: string | null = null;

/**
 * The seed org (CureForever today). The fallback org_id for any
 * service-role context that genuinely can't resolve which tenant it
 * belongs to — the WhatsApp bridge (one shared bridge process, not one
 * per org yet) and a couple of internal-only bulk-import tools. A real
 * per-tenant webhook (Shiprocket, Shopify) resolves its own org instead
 * of using this.
 */
export async function getDefaultOrgId(): Promise<string | null> {
  if (_defaultOrgIdCache) return _defaultOrgIdCache;
  const admin = getAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("organizations").select("id").eq("slug", "cureforever").maybeSingle();
  _defaultOrgIdCache = data?.id || null;
  return _defaultOrgIdCache;
}

async function resolveSessionOrgId(supabase: any): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    return data?.org_id || null;
  } catch {
    return null;
  }
}

/**
 * Reads one org's settings row (memoized per org for SETTINGS_TTL_MS).
 * Pass `orgId` when the caller already resolved it (a webhook matching its
 * own payload/headers against settings.shopify_store_domain or
 * shiprocket_webhook_secret). Otherwise resolves it from the given
 * client's own session (any authenticated route), falling back to the
 * seed org only when neither is available.
 */
export async function getSystemSettings(supabase: any, orgId?: string) {
  const resolvedOrgId = orgId || await resolveSessionOrgId(supabase) || await getDefaultOrgId();
  if (!resolvedOrgId) return null;

  const cached = _settingsCache.get(resolvedOrgId);
  if (cached && Date.now() - cached.at < SETTINGS_TTL_MS) {
    // Shallow copy so a caller that mutates the result can't poison the cache.
    return cached.data ? { ...cached.data } : cached.data;
  }

  const fresh = await fetchSettingsForOrg(resolvedOrgId);
  _settingsCache.set(resolvedOrgId, { at: Date.now(), data: fresh });
  return fresh ? { ...fresh } : fresh;
}

async function fetchSettingsForOrg(orgId: string) {
  const admin = getAdminClient();
  if (!admin) return null;

  const { data } = await admin.from("settings").select("*").eq("org_id", orgId).maybeSingle();
  if (data) return data;

  // Every org should get a blank row via the seed_default_settings trigger
  // on signup, but create one on demand rather than leaving every
  // integration call with nothing to read if that ever doesn't fire.
  const { data: created } = await admin.from("settings").insert({ org_id: orgId }).select("*").single();
  return created ?? null;
}

export async function getShiprocketToken(supabase: any, orgId?: string) {
  const settings = await getSystemSettings(supabase, orgId);
  if (!settings?.shiprocket_email || !settings?.shiprocket_password) {
    throw new Error("Shiprocket credentials missing in settings");
  }

  // Always keep a heavy buffer of 1 hour to prevent token deaths mid-flight
  const isExpired = !settings.shiprocket_token_expires_at || new Date(settings.shiprocket_token_expires_at).getTime() < (Date.now() + 3600000);

  if (settings.shiprocket_token && !isExpired) {
    return settings.shiprocket_token;
  }

  // Authenticate to get a new 10-day token
  const authRes = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: settings.shiprocket_email.trim(), password: settings.shiprocket_password.trim() })
  });

  if (!authRes.ok) throw new Error(`Auth failed with status ${authRes.status}`);
  const { token } = await authRes.json();

  // Shiprocket tokens last 10 days, we'll cache for 9 days just to be safe
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 9);

  await supabase.from("settings").update({
    shiprocket_token: token,
    shiprocket_token_expires_at: expiresAt.toISOString()
  }).eq("id", settings.id);
  clearSettingsCache(settings.org_id); // the memo would otherwise serve the pre-refresh token

  return token;
}

export async function getShopifyAccessToken(supabase: any, orgId?: string) {
  const settings = await getSystemSettings(supabase, orgId);
  if (!settings?.shopify_store_domain) {
    throw new Error("Shopify store domain missing in settings");
  }

  // Use shopify_access_token as the primary OAuth token
  const existingToken = (settings.shopify_access_token || settings.shopify_api_key || "").trim();

  // Note: Database uses shopify_api_key as Client ID, and shopify_api_secret as Client Secret
  const hasRefreshCredentials = Boolean(settings.shopify_api_key && settings.shopify_api_secret && settings.shopify_refresh_token);
  const hasClientCredentials = Boolean(settings.shopify_api_key && settings.shopify_api_secret);

  if (!hasRefreshCredentials && !hasClientCredentials) {
    if (!existingToken) {
      throw new Error("Shopify access token or refresh credentials missing in settings");
    }
    return existingToken;
  }

  const expiresAtRaw = settings.token_expires_at;
  const expiresAtMs = expiresAtRaw ? new Date(expiresAtRaw).getTime() : 0;
  // Refresh if less than 10 minutes left
  const needsRefresh = !existingToken || !expiresAtMs || expiresAtMs < (Date.now() + 10 * 60 * 1000);

  if (!needsRefresh) {
    return existingToken;
  }

  const domain = String(settings.shopify_store_domain).replace(/^https?:\/\//, "").replace(/\/$/, "");

  // Prepare Grant Type
  const bodyParams: any = {
    client_id: String(settings.shopify_api_key).trim(),
    client_secret: String(settings.shopify_api_secret).trim(),
  };

  if (settings.shopify_refresh_token) {
    bodyParams.grant_type = "refresh_token";
    bodyParams.refresh_token = String(settings.shopify_refresh_token).trim();
  } else {
    bodyParams.grant_type = "client_credentials";
  }

  const refreshRes = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(bodyParams).toString(),
  });

  if (!refreshRes.ok) {
    const errText = await refreshRes.text();
    console.error("Shopify refresh failed:", errText);
    throw new Error(`Shopify token refresh failed with status ${refreshRes.status}`);
  }

  const refreshed = await refreshRes.json();
  const refreshedToken = String(refreshed?.access_token || "").trim();
  const refreshedRefreshToken = String(refreshed?.refresh_token || "").trim();

  if (!refreshedToken) {
    throw new Error("Shopify token refresh returned empty access_token");
  }

  const expiresIn = Number(refreshed?.expires_in || 3600);
  const nextExpiry = new Date(Date.now() + (expiresIn - 300) * 1000).toISOString();

  // Prepare Update Object
  const updateData: any = {
    shopify_access_token: refreshedToken,
    token_expires_at: nextExpiry,
  };

  if (refreshedRefreshToken) {
    updateData.shopify_refresh_token = refreshedRefreshToken;
  }

  await supabase.from("settings").update(updateData).eq("id", settings.id);
  clearSettingsCache(settings.org_id); // the memo would otherwise serve the pre-refresh token

  return refreshedToken;
}
