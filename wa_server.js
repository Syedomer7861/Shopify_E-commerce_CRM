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
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode        = require("qrcode-terminal");

const app  = express();
const PORT = 3001;
app.use(express.json());

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
    const { phone, message, imagePath, mediaData, mimetype, filename, resolve } = msgQueue.shift();
    try {
        // 1. Clean and Format Number
        let cleaned = phone.replace(/[^\d]/g, "");
        
        // Auto-prefix Indian numbers if only 10 digits provided
        if (cleaned.length === 10) {
            cleaned = "91" + cleaned;
        }

        console.log(`[WA] Formatting chatId for: ${cleaned}`);
        
        // 2. Get Official WID (WhatsApp ID)
        // This is the most reliable way to send to non-contacts
        const numberDetails = await waClient.getNumberId(cleaned);
        
        if (!numberDetails || !numberDetails._serialized) {
            throw new Error(`The number ${cleaned} is not registered on WhatsApp.`);
        }

        const chatId = numberDetails._serialized;

        // 3. Send Message
        if (mediaData && mimetype) {
            console.log(`[WA] Sending media to ${chatId}...`);
            const media = new MessageMedia(mimetype, mediaData, filename || "file");
            await waClient.sendMessage(chatId, media, { caption: message });
        } else if (imagePath) {
            const media = MessageMedia.fromFilePath(imagePath);
            await waClient.sendMessage(chatId, media, { caption: message });
        } else {
            await waClient.sendMessage(chatId, message);
        }
        
        console.log(`[WA] Message sent to ${chatId} ✅`);
        resolve({ ok: true });
    } catch (e) {
        console.error(`[WA] Send failed:`, e.message);
        resolve({ ok: false, error: e.message });
    }
    processing = false;
    setTimeout(processQueue, 200); // Slightly more delay to avoid rate limiting
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
        console.log("\n[WA] Or open http://localhost:3000/qr in a browser to see it.");
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
    const { phone, message, imagePath, mediaData, mimetype, filename } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ ok: false, error: "phone and message are required" });
    }
    if (!isReady) {
        return res.status(503).json({ ok: false, error: `WhatsApp not ready — state: ${clientState}` });
    }

    // Clean phone number
    let cleaned = phone.replace(/[^\d+]/g, "").replace(/^'/, "");
    if (!cleaned.startsWith("+")) cleaned = "+" + cleaned;

    const result = await new Promise((resolve) => {
        msgQueue.push({ phone: cleaned, message, imagePath, mediaData, mimetype, filename, resolve });
        processQueue();
    });

    res.json(result);
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
    console.log(` Listening on http://localhost:${PORT}`);
    console.log(`${"=".repeat(50)}\n`);
    initClient();
});
