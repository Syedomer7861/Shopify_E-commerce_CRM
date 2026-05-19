/**
 * Cureforever WhatsApp Server
 * ============================
 * Runs whatsapp-web.js and exposes a local HTTP API on port 3000.
 * Python app.py calls this to send messages — no browser automation needed.
 *
 * Endpoints:
 *   GET  /status       → { ready: bool, qr: string|null, state: string }
 *   GET  /qr           → { qr: string }  (base64 QR image)
 *   POST /send         → { phone, message } → { ok: bool, error?: string }
 *   POST /logout       → logs out and clears session
 */

const express       = require("express");
const helmet        = require("helmet");
const rateLimit     = require("express-rate-limit");
const { z }         = require("zod");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode        = require("qrcode-terminal");
require("dotenv").config({ path: ".env.local" });

const app  = express();
const PORT = 3001;

// 1. Security Headers (configured for local HTTP service — no HTTPS enforcement)
app.use(helmet({
  hsts: false,                     // No Strict-Transport-Security (local HTTP)
  contentSecurityPolicy: false,    // No CSP for API server
}));

// 2. Rate Limiting (Prevent API abuse)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes"
});
app.use("/send", limiter);

app.use(express.json());

// 3. Input Validation Schemas
const SendMessageSchema = z.object({
  phone: z.string().min(10).max(20),
  message: z.string().min(1),
  buttons: z.array(z.object({ text: z.string(), id: z.string() })).optional(),
  imagePath: z.string().optional(),
  mediaData: z.string().optional(),
  mimetype: z.string().optional(),
  filename: z.string().optional()
});

let waClient   = null;
let isReady    = false;
let currentQR  = null;
let clientState = "DISCONNECTED";
let initError  = null;

// ── Message queue to prevent race conditions ──────────────────────────────────
const msgQueue = [];
let processing = false;

async function processQueue() {
    if (processing || msgQueue.length === 0) return;
    processing = true;
    const { phone, message, buttons, imagePath, mediaData, mimetype, filename, resolve } = msgQueue.shift();
    try {
        // 1. Clean and Format Number
        let cleaned = phone.replace(/[^\d]/g, "");
        
        // Auto-prefix Indian numbers if only 10 digits provided
        if (cleaned.length === 10) {
            cleaned = "91" + cleaned;
        }

        console.log(`[WA] Formatting chatId for: ${cleaned}`);
        
        // 2. Get Official WID (WhatsApp ID)
        const numberDetails = await waClient.getNumberId(cleaned);
        
        if (!numberDetails || !numberDetails._serialized) {
            throw new Error(`The number ${cleaned} is not registered on WhatsApp.`);
        }

        const chatId = numberDetails._serialized;

        // 3. Send Message
        let content = message;
        if (buttons && buttons.length > 0) {
            // Support for buttons
            const waButtons = buttons.map(b => ({ body: b.text, id: b.id }));
            content = new Buttons(message, waButtons, "", "");
        }

        if (mediaData && mimetype) {
            console.log(`[WA] Sending media to ${chatId}...`);
            const media = new MessageMedia(mimetype, mediaData, filename || "file");
            await waClient.sendMessage(chatId, media, { caption: message });
        } else if (imagePath) {
            const media = MessageMedia.fromFilePath(imagePath);
            await waClient.sendMessage(chatId, media, { caption: message });
        } else {
            await waClient.sendMessage(chatId, content);
        }
        
        console.log(`[WA] Message sent to ${chatId} ✅`);
        resolve({ ok: true });
    } catch (e) {
        console.error(`[WA] Send failed:`, e.message);
        resolve({ ok: false, error: e.message });
    }
    processing = false;
    setTimeout(processQueue, 200); 
}


// ── Init WhatsApp client ──────────────────────────────────────────────────────
function initClient() {
    console.log("[WA] Initialising whatsapp-web.js client...");
    clientState = "INITIALISING";

    waClient = new Client({
        authStrategy: new LocalAuth({ dataPath: "./.wa_session" }),
        puppeteer: {
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--no-zygote",
                "--disable-gpu",
            ],
        },
    });

    waClient.on("qr", (qr) => {
        currentQR   = qr;
        isReady     = false;
        clientState = "QR_PENDING";
        console.log("\n[WA] QR Code ready — scan with WhatsApp on your phone:");
        qrcode.generate(qr, { small: true });
        console.log("\n[WA] Or open http://127.0.0.1:3001/qr in a browser to see it.");
    });

    waClient.on("authenticated", () => {
        currentQR   = null;
        clientState = "AUTHENTICATED";
        console.log("[WA] Authenticated ✅");
    });

    waClient.on("ready", () => {
        isReady     = true;
        currentQR   = null;
        clientState = "READY";
        initError   = null;
        console.log("[WA] Client ready — accepting send requests ✅");
    });

    waClient.on("message", async (msg) => {
        console.log(`[WA] Incoming ${msg.type} from ${msg.from}: ${msg.body.substring(0, 20)}...`);
        try {
            // Forward to CRM Webhook
            const crmUrl = process.env.CRM_WEBHOOK_URL || "http://localhost:3000/api/webhooks/whatsapp";
            
            const payload = {
                from: msg.from,
                body: msg.body,
                timestamp: msg.timestamp,
                type: msg.type,
                selectedButtonId: msg.selectedButtonId || null,
                selectedRowId: msg.selectedRowId || null
            };

            await fetch(crmUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        } catch (e) {
            console.error("[WA] Failed to forward message to CRM:", e.message);
        }
    });

    waClient.on("auth_failure", (msg) => {
        isReady     = false;
        clientState = "AUTH_FAILED";
        initError   = msg;
        console.error("[WA] Auth failed:", msg);
    });

    waClient.on("disconnected", (reason) => {
        isReady     = false;
        clientState = "DISCONNECTED";
        console.warn("[WA] Disconnected:", reason, "— reinitialising in 5s...");
        setTimeout(initClient, 5000);
    });

    waClient.initialize().catch((err) => {
        initError   = err.message;
        clientState = "ERROR";
        console.error("[WA] Init error:", err.message);
    });
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/status", async (req, res) => {
    let internalState = clientState;
    if (waClient) {
        try {
            const actualState = await waClient.getState();
            if (actualState) {
                internalState = actualState.toUpperCase();
                // Sync internal flags if we detected a change
                if (internalState === "CONNECTED") {
                    isReady = true;
                    clientState = "READY";
                }
            }
        } catch (e) {
            // getState might fail if not fully init, that's fine
        }
    }

    res.json({
        ready:  isReady,
        state:  internalState,
        qr:     currentQR ? "pending" : null,
        error:  initError,
    });
});

// Returns QR as JSON data (used by CRM Settings page to render inline)
app.get("/qr-data", (req, res) => {
    if (!currentQR) {
        return res.json({ qr: null, state: clientState, ready: isReady });
    }
    // Generate a QR image URL that the frontend can use in an <img> tag
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}`;
    res.json({ qr: qrImageUrl, qrRaw: currentQR, state: clientState, ready: isReady });
});

app.get("/qr", (req, res) => {
    if (!currentQR) {
        return res.json({ ok: false, error: "No QR available — client may already be authenticated" });
    }
    // Return QR as a simple HTML page for easy scanning
    res.send(`<!DOCTYPE html>
<html>
<head>
  <title>WhatsApp QR</title>
  <style>
    body { font-family: Arial; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; margin:0; background:#f0f2f5; }
    h2 { color: #128C7E; }
    img { border: 8px solid white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
    p { color: #555; font-size: 14px; }
    .refresh { margin-top:16px; padding:10px 24px; background:#128C7E; color:white; border:none; border-radius:6px; cursor:pointer; font-size:14px; }
  </style>
  <script>
    // Auto-refresh every 20s to get new QR if expired
    setTimeout(() => location.reload(), 20000);
  </script>
</head>
<body>
  <h2>Scan with WhatsApp</h2>
  <p>Open WhatsApp → Linked Devices → Link a Device</p>
  <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}" />
  <p style="font-size:12px;color:#999;">Auto-refreshes every 20 seconds</p>
  <button class="refresh" onclick="location.reload()">Refresh QR</button>
</body>
</html>`);
});

app.post("/send", async (req, res) => {
    try {
        // Validate Input
        const validated = SendMessageSchema.parse(req.body);
        const { phone, message, buttons, imagePath, mediaData, mimetype, filename } = validated;

        if (!isReady) {
            return res.status(503).json({ ok: false, error: `WhatsApp not ready — state: ${clientState}` });
        }

        // Clean phone number
        let cleaned = phone.replace(/[^\d+]/g, "").replace(/^'/, "");
        if (!cleaned.startsWith("+")) cleaned = "+" + cleaned;

        const result = await new Promise((resolve) => {
            msgQueue.push({ phone: cleaned, message, buttons, imagePath, mediaData, mimetype, filename, resolve });
            processQueue();
        });

        res.json(result);
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ ok: false, error: "Validation failed", details: e.errors });
        }
        res.status(500).json({ ok: false, error: e.message });
    }
});


app.post("/logout", async (req, res) => {
    try {
        if (waClient) {
            await waClient.logout();
            await waClient.destroy();
        }
        isReady     = false;
        clientState = "LOGGED_OUT";
        res.json({ ok: true });
        // Don't auto-init, wait for user to click restart/scan
    } catch (e) {
        res.json({ ok: false, error: e.message });
    }
});

app.post("/restart", async (req, res) => {
    try {
        console.log("[WA] Manual restart requested...");
        if (waClient) {
            try { await waClient.destroy(); } catch(e) {}
        }
        isReady = false;
        currentQR = null;
        initClient();
        res.json({ ok: true, state: "RESTARTING" });
    } catch (e) {
        res.json({ ok: false, error: e.message });
    }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n${"=".repeat(50)}`);
    console.log(` Cureforever WhatsApp Server`);
    console.log(` Listening on http://127.0.0.1:${PORT}`);
    console.log(`${"=".repeat(50)}\n`);
    initClient();
});

// ── Backup Daemon (Daily at 3 AM) ──────────────────────────────────────────────
const BACKUP_SECRET = process.env.BACKUP_SECRET || "cureforever_sync_secret_2026";
const BACKUP_BASE_URL = process.env.SYNC_BASE_URL || "http://127.0.0.1:3000";
const BACKUP_URL = BACKUP_BASE_URL + "/api/backup?secret=" + BACKUP_SECRET;

async function runBackup() {
    console.log("[BACKUP] Triggering Scheduled Daily Backup...");
    try {
        const res = await fetch(BACKUP_URL);
        const text = await res.text();
        
        try {
            const data = JSON.parse(text);
            if (data.success) {
                console.log("[BACKUP] Backup successful! ✅ (Files uploaded to Google Drive)");
            } else {
                console.error("[BACKUP] Backup failed:", data.error);
            }
        } catch (parseErr) {
            console.error("[BACKUP] Response was not JSON. (Is Next.js server running on port 3000?)");
            console.error("[BACKUP] Response start:", text.substring(0, 100));
        }
    } catch (e) {
        let errorMsg = e.message;
        if (errorMsg === 'fetch failed' || e.code === 'ECONNREFUSED') {
            errorMsg = `Main CRM server unreachable at ${BACKUP_BASE_URL}. Ensure 'npm run dev' is active.`;
        }
        console.error("[BACKUP] Backup request failed:", errorMsg);
    }
}

// Check every hour to see if it's 3 AM
let lastBackupDate = "";
setInterval(() => {
    const now = new Date();
    const hour = now.getHours();
    const dateStr = now.toISOString().split("T")[0];

    if (hour === 3 && lastBackupDate !== dateStr) {
        lastBackupDate = dateStr;
        runBackup();
    }
}, 3600000); // Check once an hour

// Run a one-time backup after 30 seconds on startup for verification
setTimeout(() => {
    console.log("[BACKUP] Running startup backup verification...");
    runBackup();
}, 30000);
