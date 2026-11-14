// NOTE: chat is no longer served from here. The CRM talks to Supabase
// Realtime directly (src/lib/chat-bus.ts), so chat works on Vercel with no
// standalone process. This file is kept for the local 15-minute background
// sync loop below; in production that runs as the /api/sync/all Vercel cron.
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { createClient } = require("@supabase/supabase-js");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
require("dotenv").config();

// Same crash-visibility handlers added to wa_server.js - see that file's
// comment for the reasoning. Applies here too: this is only "superseded
// in production" for chat itself (the note above); the local 15-minute
// sync loop it still runs was a real, separate long-lived process with
// no framework catching an unhandled error for it either.
process.on("uncaughtException", (err) => {
  console.error("[CHAT] FATAL uncaughtException:", err.stack || err.message || err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[CHAT] FATAL unhandledRejection:", reason instanceof Error ? (reason.stack || reason.message) : reason);
  process.exit(1);
});

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// 1. Rate Limiting for Health/Sync endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: "Too many requests, please try again later"
});
app.use("/health", apiLimiter);
app.use("/sync-now", apiLimiter);

// 2. Validation Schemas
const ChatMessageSchema = z.object({
  channelId: z.string().uuid(),
  content: z.string().optional(),
  type: z.enum(["text", "image", "file", "task"]).default("text"),
  fileUrl: z.string().url().optional().or(z.literal("")),
  taskId: z.string().uuid().optional().nullable(),
  metadata: z.record(z.any()).optional()
}).refine(data => data.content || data.fileUrl, {
  message: "Either content or fileUrl must be provided"
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ── Supabase Clients ──────────────────────────────────────────────────────────
// 1. Admin client for database operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// 2. Auth-only client for verifying user tokens (uses ANON key to avoid session conflicts)
const authClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

// ── Auth Middleware ──────────────────────────────────────────────────────────
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Unauthorized: No token provided"));

    // Verify token with the dedicated Auth client
    const { data: { user }, error } = await authClient.auth.getUser(token);
    
    if (error || !user) {
      console.error("[Chat] Auth error:", error?.message || "Invalid or expired token");
      console.debug(`[Chat] Attempted token length: ${token?.length}, prefix: ${token?.substring(0, 10)}...`);
      return next(new Error("Unauthorized: Authentication failed"));
    }

    // Fetch profile to get role and name
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    socket.user = { ...user, ...profile };
    next();
  } catch (err) {
    console.error("[Chat] Middleware error:", err.message);
    next(new Error("Internal Server Error"));
  }
});

const onlineUsers = new Map(); // userId -> Set(socketIds)

// ── Supabase Realtime Listener ────────────────────────────────────────────────
// This ensures that messages sent via API or other sources also broadcast to Socket.IO
supabase
  .channel('public:messages')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
    const message = payload.new;
    console.log(`[Chat] Realtime broadcast for channel ${message.channel_id}`);
    
    // Fetch full message with sender details
    const { data: fullMessage } = await supabase
      .from("messages")
      .select(`
        *,
        sender:profiles!sender_id(id, name, email, role)
      `)
      .eq('id', message.id)
      .single();

    if (fullMessage) {
      io.to(`channel:${message.channel_id}`).emit("message:new", fullMessage);
    }
  })
  .subscribe();

// ── Socket Handlers ───────────────────────────────────────────────────────────
io.on("connection", async (socket) => {
  const userId = socket.user.id;
  const userName = socket.user.name || socket.user.email;
  console.log(`[Chat] User connected: ${userName} (${userId})`);

  // Update presence
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId).add(socket.id);
  io.emit("presence:update", Array.from(onlineUsers.keys()));

  // Send current online users to the new user
  socket.emit("presence:initial", Array.from(onlineUsers.keys()));

  // Join user's personal room for DMs and notifications
  socket.join(`user:${userId}`);

  // Fetch and join all channels the user is a member of
  const { data: memberships } = await supabase
    .from("channel_members")
    .select("channel_id")
    .eq("user_id", userId);

  if (memberships) {
    memberships.forEach(m => {
      socket.join(`channel:${m.channel_id}`);
    });
  }

  // ── Message Events ──────────────────────────────────────────────────────────
  
  socket.on("message:send", async (data, callback) => {
    try {
      // 1. Validate Input
      const validated = ChatMessageSchema.parse(data);
      const { channelId, content, type, fileUrl, taskId, metadata } = validated;

      // 2. Verify membership
      const { data: member } = await supabase
        .from("channel_members")
        .select("role")
        .eq("channel_id", channelId)
        .eq("user_id", userId)
        .single();

      if (!member && socket.user.role !== 'admin') {
        return callback?.({ ok: false, error: "Not a member of this channel" });
      }

      // 3. Save to database
      // Note: The Supabase Realtime Listener above will handle broadcasting
      const { data: message, error: insertError } = await supabase
        .from("messages")
        .insert({
          channel_id: channelId,
          sender_id: userId,
          content,
          type,
          file_url: fileUrl,
          task_id: taskId,
          metadata: metadata || {}
        })
        .select(`
          *,
          sender:profiles!sender_id(id, name, email, role)
        `)
        .single();

      if (insertError) throw insertError;

      // 3. Optional: Instant broadcast for sender responsiveness
      // However, we'll let the Realtime listener do it to avoid duplicates
      // Or we can do it here and check for duplicates on client.
      // Let's do it here for "zero latency" feel, clients should handle duplicate IDs.
      io.to(`channel:${channelId}`).emit("message:new", message);

      // 4. Handle mentions
      const mentions = content?.match(/@\[([^\]]+)\]\(user:([^\)]+)\)/g);
      if (mentions) {
        mentions.forEach(m => {
          const match = m.match(/user:([^\)]+)/);
          if (match && match[1]) {
            const mentionedId = match[1];
            io.to(`user:${mentionedId}`).emit("notification:mention", {
              message,
              channelId
            });
          }
        });
      }

      callback?.({ ok: true, message });
    } catch (err) {
      console.error("[Chat] Send error:", err.message);
      if (err instanceof z.ZodError) {
        return callback?.({ ok: false, error: "Validation failed", details: err.errors });
      }
      callback?.({ ok: false, error: err.message });
    }
  });

  socket.on("message:seen", async (data) => {
    const { channelId } = data;
    try {
      // Update channel_members last_read_at
      if (channelId) {
        await supabase
          .from("channel_members")
          .update({ last_read_at: new Date() })
          .eq("channel_id", channelId)
          .eq("user_id", userId);
          
        // Broadcast to user's other tabs to update unread count
        io.to(`user:${userId}`).emit("unread:refresh", { channelId });
      }
    } catch (err) {
      console.error("[Chat] Seen error:", err.message);
    }
  });

  // ── Channel Management ──────────────────────────────────────────────────────
  
  socket.on("channel:join", (data) => {
    const { channelId } = data;
    if (channelId) {
      console.log(`[Chat] User ${userName} joined room: channel:${channelId}`);
      socket.join(`channel:${channelId}`);
    }
  });

  socket.on("channel:leave", (data) => {
    const { channelId } = data;
    if (channelId) {
      socket.leave(`channel:${channelId}`);
    }
  });

  // ── Typing Events ───────────────────────────────────────────────────────────
  
  socket.on("typing:start", (data) => {
    const { channelId } = data;
    socket.to(`channel:${channelId}`).emit("user:typing", {
      userId,
      userName,
      channelId
    });
  });

  socket.on("typing:stop", (data) => {
    const { channelId } = data;
    socket.to(`channel:${channelId}`).emit("user:stop_typing", {
      userId,
      channelId
    });
  });

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  socket.on("disconnect", () => {
    console.log(`[Chat] User disconnected: ${userName}`);
    
    const sockets = onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        onlineUsers.delete(userId);
      }
    }
    
    io.emit("presence:update", Array.from(onlineUsers.keys()));
  });
});

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/sync-now", async (req, res) => {
  runBackgroundSync();
  res.json({ status: "Sync triggered" });
});

// ── Background Synchronization ──────────────────────────────────────────────
let isSyncing = false;

async function fetchWithTimeout(url, options = {}, timeout = 600000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

async function logSyncAudit(action, summary, metadata = {}) {
  try {
    await supabase.from("audit_logs").insert({
      actor_id: null,
      actor_email: "system@sync.internal",
      entity_type: "system",
      action: action,
      summary: summary,
      metadata: metadata
    });
  } catch (err) {
    console.error("[Sync] Failed to log audit event:", err.message);
  }
}

async function runBackgroundSync() {
  if (isSyncing) {
    console.log("[Sync] ⏳ Sync already in progress, skipping cycle.");
    return;
  }

  isSyncing = true;
  console.log(`[Sync] 🔄 Starting 15-minute background synchronization at ${new Date().toLocaleTimeString()}...`);
  
  await logSyncAudit("SYNC_START", "Background synchronization started");

  // Notify all users that sync has started
  io.emit("system:sync_alert", { 
    message: "Background synchronization started...", 
    type: "info",
    timestamp: new Date().toISOString()
  });

  // Narrow shared secret, never the service-role key (that one can read every table).
  const syncSecret = process.env.SYNC_SECRET || process.env.CRON_SECRET || "";
  const baseUrl = process.env.SYNC_BASE_URL || "http://localhost:3000";

  try {
    // 1. Shopify Sync (Wait up to 15 mins)
    console.log("[Sync] 📦 Syncing Shopify data...");
    const shopifyRes = await fetchWithTimeout(`${baseUrl}/api/sync/shopify?full=false`, {
      method: "POST",
      headers: { "x-sync-secret": syncSecret }
    }, 900000); 
    const shopifyData = await shopifyRes.json();
    console.log("[Sync] ✅ Shopify Sync Complete:", shopifyData.report || "No report");

    // 2. Shiprocket Sync (Wait up to 30 mins)
    console.log("[Sync] 🚚 Syncing Shiprocket data...");
    const shiprocketRes = await fetchWithTimeout(`${baseUrl}/api/sync/shiprocket?full=false`, {
      method: "POST",
      headers: { "x-sync-secret": syncSecret }
    }, 1800000);
    const shiprocketData = await shiprocketRes.json();
    console.log("[Sync] ✅ Shiprocket Sync Complete:", shiprocketData.report || "No report");

    // Calculate totals
    const shopifyOrders = shopifyData.report?.orders?.synced || 0;
    const shiprocketOrders = shiprocketData.report?.orders_processed || 0;
    const totalOrders = shopifyOrders + shiprocketOrders;
    const totalTasks = (shopifyData.report?.tasks?.created || 0);

    const detailedSummary = `Sync complete: ${totalOrders} orders synced (Shopify: ${shopifyOrders}, Shiprocket: ${shiprocketOrders}) and ${totalTasks} new tasks created.`;
    console.log(`[Sync] ✨ ${detailedSummary}`);

    await logSyncAudit("SYNC_COMPLETE", detailedSummary, {
      totalOrders,
      totalTasks,
      shopify: shopifyData.report,
      shiprocket: shiprocketData.report
    });

    // Notify all users that sync is complete
    io.emit("system:sync_alert", { 
      message: `Sync complete! ${totalOrders} orders updated and ${totalTasks} tasks created.`, 
      type: "success",
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    let errorMsg = error.name === 'AbortError' ? 'Sync timed out' : error.message;
    
    // Provide more context for common networking errors
    if (errorMsg === 'fetch failed' || error.code === 'ECONNREFUSED') {
      errorMsg = `Main CRM server unreachable at ${baseUrl}. Ensure 'npm run dev' is active.`;
    }

    console.error("[Sync] ❌ Background sync failed:", errorMsg);
    
    await logSyncAudit("SYNC_ERROR", `Sync failed: ${errorMsg}`);

    // Only alert users if it's a logic error, not a network/connection issue
    if (error.name !== 'AbortError' && errorMsg !== 'fetch failed' && error.code !== 'ECONNREFUSED') {
      io.emit("system:sync_alert", { 
        message: `Background sync issue: ${errorMsg}.`, 
        type: "error",
        timestamp: new Date().toISOString()
      });
    }
  } finally {
    isSyncing = false;
  }
}

// Initial sync on startup after 30s to allow everything to boot
setTimeout(() => {
  console.log("[Sync] Triggering initial startup sync...");
  runBackgroundSync();
}, 30000);

// Run every 15 minutes
setInterval(runBackgroundSync, 15 * 60 * 1000);

const PORT = process.env.CHAT_PORT || 3002;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n${"=".repeat(50)}`);
  console.log(` CureForever Chat Server`);
  console.log(` Listening on http://127.0.0.1:${PORT}`);
  console.log(`${"=".repeat(50)}\n`);
});
