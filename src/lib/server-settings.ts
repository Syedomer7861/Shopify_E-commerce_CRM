const SETTINGS_ID = "00000000-0000-0000-0000-000000000000";

export { SETTINGS_ID };

export async function getSystemSettings(supabase: any) {
  const { data: fixed } = await supabase
    .from("settings")
    .select("*")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (fixed) return fixed;

  const { data: latest } = await supabase
    .from("settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest) return latest;

  const { data: created } = await supabase
    .from("settings")
    .insert({ id: SETTINGS_ID })
    .select("*")
    .single();

  return created ?? null;
}

export async function getShiprocketToken(supabase: any) {
  const settings = await getSystemSettings(supabase);
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

  return token;
}

export async function getShopifyAccessToken(supabase: any) {
  const settings = await getSystemSettings(supabase);
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

  return refreshedToken;
}
