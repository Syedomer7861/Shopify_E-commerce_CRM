# Hosted WhatsApp bridge

One always-on server that links each organisation's WhatsApp number by QR
code. Customers press **Connect WhatsApp** in Settings, then WhatsApp Hub, and
scan. Nothing to install on their side. Orgs on the Meta Cloud API keep using
Meta; an org's own bridge URL (if set) still wins.

Not WhatsApp's official API. A number that sends in bulk or gets reported
can be banned. Keep the anti-ban delay on.

## Deploy (once)

Needs a host that runs a Docker container **always on** with a **persistent
disk** (free tiers that sleep or wipe disk will log every org out).

- Railway: New project, Deploy from GitHub repo, root directory `bridge`,
  add a Volume mounted at `/data`, and set the variables below.
- Any VPS (e.g. Oracle Cloud free VM): `docker build -t wa-bridge bridge/`,
  then `docker run -d --restart=always -p 3001:3001 -v wa-data:/data --env-file bridge.env wa-bridge`,
  behind HTTPS (Caddy or the host's proxy).

### Bridge variables

| Name | Value |
|---|---|
| `BRIDGE_SECRET` | random, 32+ chars, e.g. `openssl rand -hex 32` |
| `SYNC_SECRET` | the CRM's `CRON_SECRET` |
| `CRM_WEBHOOK_URL` | `https://cureforever-crm.vercel.app/api/webhooks/whatsapp` |

### CRM (Vercel) variables

| Name | Value |
|---|---|
| `WHATSAPP_HOSTED_BRIDGE_URL` | the bridge's public HTTPS URL |
| `WHATSAPP_HOSTED_BRIDGE_SECRET` | same value as `BRIDGE_SECRET` |

Redeploy the CRM after adding them. Check: `https://<bridge>/health` returns
`{"ok":true}`.

## Which bridge an org uses

1. Its own Bridge Server URL in Settings, when filled in.
2. The `WHATSAPP_BRIDGE_URL` bridge, only for the org that owns it.
3. Otherwise its own session on this hosted bridge.

If none can send, Meta Cloud API is tried when configured.
