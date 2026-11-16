/**
 * CodeCrest hosted WhatsApp bridge.
 *
 * One always-on process holding a separate WhatsApp Web login per
 * organisation, so customers link WhatsApp by scanning a QR in Settings
 * instead of running anything themselves. Speaks the same API as the
 * single-org wa_server.js, under a per-org base path:
 *
 *   /orgs/:orgId/:token/status    GET  { ready, state, qr, error }
 *   /orgs/:orgId/:token/qr-data   GET  { qr (data URL) , state, ready }  starts a session if none
 *   /orgs/:orgId/:token/send      POST { phone, message, mediaData?, mimetype?, filename? }
 *   /orgs/:orgId/:token/restart   POST fresh session (new QR if not linked)
 *   /orgs/:orgId/:token/logout    POST unlink the phone and delete the session
 *   /health                       GET
 *
 * token = HMAC-SHA256(BRIDGE_SECRET, orgId) hex. Only the CRM server knows
 * BRIDGE_SECRET; it builds the URL for the org of the signed-in user, so a
 * leaked URL only ever reaches one org, and an org can never reach another.
 *
 * Inbound messages are POSTed to CRM_WEBHOOK_URL with x-sync-secret and
 * x-wa-org, and the CRM files them under that org.
 *
 * Env: BRIDGE_SECRET, SYNC_SECRET (the CRM's CRON_SECRET), CRM_WEBHOOK_URL,
 *      SESSIONS_DIR (persistent disk, default ./sessions), PORT (default 3001).
 *
 * Not WhatsApp's official API: numbers that send in bulk or get reported can
 * be banned. Orgs that need the official route use Meta Cloud API instead.
 */
import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";
import QRCode from "qrcode";
import makeWASocket, { Browsers, DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys";

const { BRIDGE_SECRET, SYNC_SECRET, CRM_WEBHOOK_URL } = process.env;
const PORT = Number(process.env.PORT || 3001);
const SESSIONS_DIR = process.env.SESSIONS_DIR || "./sessions";
if (!BRIDGE_SECRET || BRIDGE_SECRET.length < 32) throw new Error("BRIDGE_SECRET (32+ chars) is required");
if (!SYNC_SECRET || !CRM_WEBHOOK_URL) throw new Error("SYNC_SECRET and CRM_WEBHOOK_URL are required");
mkdirSync(SESSIONS_DIR, { recursive: true });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const logger = pino({ level: process.env.LOG_LEVEL || "warn" });

export const tokenFor = (orgId) => createHmac("sha256", BRIDGE_SECRET).update(orgId).digest("hex");
const tokenOk = (orgId, token) => {
  const want = Buffer.from(tokenFor(orgId));
  const got = Buffer.from(String(token));
  return got.length === want.length && timingSafeEqual(got, want);
};

/** orgId -> { sock, state, qr, error, queue } */
const sessions = new Map();

async function start(orgId) {
  const existing = sessions.get(orgId);
  if (existing && existing.state !== "CLOSED") return existing;
  const s = { sock: null, state: "INITIALISING", qr: null, error: null, queue: Promise.resolve() };
  sessions.set(orgId, s);

  const dir = join(SESSIONS_DIR, orgId);
  const { state: auth, saveCreds } = await useMultiFileAuthState(dir);
  const sock = makeWASocket({ auth, logger, browser: Browsers.ubuntu("CodeCrest"), markOnlineOnConnect: false, syncFullHistory: false });
  s.sock = sock;
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) { s.qr = await QRCode.toDataURL(qr, { margin: 1, width: 300 }); s.state = "QR_PENDING"; }
    if (connection === "open") { s.qr = null; s.error = null; s.state = "READY"; }
    if (connection === "close") {
      if (sessions.get(orgId) !== s) return; // replaced by restart/logout; leave the new session alone
      const code = lastDisconnect?.error?.output?.statusCode;
      s.qr = null;
      s.state = "CLOSED";
      if (code === DisconnectReason.loggedOut) {
        // Unlinked from the phone: forget the session so the next visit shows a fresh QR.
        rmSync(dir, { recursive: true, force: true });
        sessions.delete(orgId);
      } else if (auth.creds.registered) {
        setTimeout(() => start(orgId).catch((e) => logger.error({ orgId, e }, "reconnect failed")), 3000);
      } else {
        // QR never scanned (it expires): drop it rather than spin forever. Next visit restarts it.
        rmSync(dir, { recursive: true, force: true });
        sessions.delete(orgId);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      const jid = m.key.remoteJid || "";
      if (m.key.fromMe || !jid.endsWith("@s.whatsapp.net")) continue; // skip own, groups, status
      const msg = m.message || {};
      const body = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.buttonsResponseMessage?.selectedDisplayText || "";
      try {
        await fetch(CRM_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-sync-secret": SYNC_SECRET, "x-wa-org": orgId },
          body: JSON.stringify({
            from: jid, body, timestamp: Number(m.messageTimestamp) || Math.floor(Date.now() / 1000),
            type: Object.keys(msg)[0] || "unknown",
            selectedButtonId: msg.buttonsResponseMessage?.selectedButtonId || null,
          }),
          signal: AbortSignal.timeout(10000),
        });
      } catch (e) { logger.error({ orgId, err: e.message }, "forward to CRM failed"); }
    }
  });
  return s;
}

async function send(s, { phone, message, mediaData, mimetype, filename }) {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = "91" + digits; // same default as wa_server.js
  const [hit] = await s.sock.onWhatsApp(digits);
  if (!hit?.exists) throw new Error(`The number ${digits} is not registered on WhatsApp.`);
  if (mediaData && mimetype) {
    const buf = Buffer.from(mediaData, "base64");
    const content = mimetype.startsWith("image/")
      ? { image: buf, mimetype, caption: message }
      : { document: buf, mimetype, fileName: filename || "file", caption: message };
    await s.sock.sendMessage(hit.jid, content);
  } else {
    await s.sock.sendMessage(hit.jid, { text: message });
  }
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "20mb" }));
app.get("/health", (_req, res) => res.json({ ok: true, sessions: sessions.size }));

const org = express.Router({ mergeParams: true });
app.use("/orgs/:orgId/:token", (req, res, next) => {
  const { orgId, token } = req.params;
  if (!UUID.test(orgId) || !tokenOk(orgId, token)) return res.status(404).json({ ok: false, error: "Not found" });
  next();
}, org);

const view = (s) => ({ ready: s?.state === "READY", state: s?.state || "NOT_STARTED", qr: s?.qr || null, error: s?.error || null });

org.get("/status", (req, res) => res.json(view(sessions.get(req.params.orgId))));

org.get("/qr-data", async (req, res) => {
  try { res.json(view(await start(req.params.orgId))); }
  catch (e) { res.status(500).json({ ...view(null), error: e.message }); }
});

org.post("/send", async (req, res) => {
  const s = sessions.get(req.params.orgId);
  const { phone, message } = req.body || {};
  if (typeof phone !== "string" || phone.length < 10 || phone.length > 20 || typeof message !== "string" || !message) {
    return res.status(400).json({ ok: false, error: "phone and message are required" });
  }
  if (s?.state !== "READY") return res.status(503).json({ ok: false, error: `WhatsApp not ready - state: ${s?.state || "NOT_STARTED"}` });
  // One message at a time per org, with a short gap, like wa_server.js.
  const job = s.queue.then(() => send(s, req.body)).then(() => ({ ok: true }), (e) => ({ ok: false, error: e.message }));
  s.queue = job.then(() => new Promise((r) => setTimeout(r, 300)));
  res.json(await job);
});

org.post("/restart", async (req, res) => {
  const s = sessions.get(req.params.orgId);
  if (s?.state === "READY") return res.json({ ok: true, state: "READY" });
  try { s?.sock?.end(undefined); } catch { /* already closed */ }
  sessions.delete(req.params.orgId);
  try { res.json({ ok: true, state: (await start(req.params.orgId)).state }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

org.post("/logout", async (req, res) => {
  const { orgId } = req.params;
  const s = sessions.get(orgId);
  try { await s?.sock?.logout(); } catch { /* not linked */ }
  sessions.delete(orgId);
  rmSync(join(SESSIONS_DIR, orgId), { recursive: true, force: true });
  res.json({ ok: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[bridge] listening on ${PORT}`);
  // Bring back every org that was linked before a restart.
  for (const id of readdirSync(SESSIONS_DIR)) {
    if (UUID.test(id)) start(id).catch((e) => logger.error({ id, err: e.message }, "restore failed"));
  }
});
