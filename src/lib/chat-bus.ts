import type { SupabaseClient } from "@supabase/supabase-js";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Chat transport backed by Supabase Realtime.
 *
 * Vercel cannot host the long-lived socket.io process in chat_server.js, so
 * chat used to die in production. Supabase Realtime is already a dependency
 * and already holds the messages table, so it replaces the socket entirely:
 *
 *   messages INSERT (postgres_changes) -> "message:new"
 *   presence                           -> "presence:update"
 *   broadcast                          -> "user:typing" / "user:stop_typing"
 *
 * The emit/on/off surface deliberately mirrors socket.io so ChatInput,
 * MessageList and ChannelList keep working unchanged.
 */

type Handler = (...args: any[]) => void;

export interface ChatBusUser {
  id: string;
  name?: string | null;
  role?: string | null;
}

export class ChatBus {
  connected = false;

  private handlers = new Map<string, Set<Handler>>();
  private channel: RealtimeChannel | null = null;
  private closed = false;

  constructor(
    private supabase: SupabaseClient,
    private user: ChatBusUser
  ) {}

  // ── socket.io-compatible surface ───────────────────────────────────────────

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return this;
  }

  off(event: string, handler?: Handler) {
    if (!handler) this.handlers.delete(event);
    else this.handlers.get(event)?.delete(handler);
    return this;
  }

  emit(event: string, payload?: any, callback?: (res: any) => void) {
    switch (event) {
      case "message:send":
        this.sendMessage(payload, callback);
        break;
      case "message:seen":
        this.markSeen(payload?.channelId);
        break;
      case "typing:start":
      case "typing:stop":
        this.broadcastTyping(event, payload?.channelId);
        break;
      // Realtime uses one connection for every channel the user can read, so
      // joining and leaving individual rooms is a no-op.
      case "channel:join":
      case "channel:leave":
        break;
      default:
        break;
    }
    return this;
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────

  connect() {
    if (this.channel) return;

    this.channel = this.supabase
      .channel("crm-chat", { config: { presence: { key: this.user.id } } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => this.onMessageInsert(payload.new as any)
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (!payload || payload.userId === this.user.id) return;
        this.dispatch(payload.typing ? "user:typing" : "user:stop_typing", {
          userId: payload.userId,
          userName: payload.userName,
          channelId: payload.channelId,
        });
      })
      .on("presence", { event: "sync" }, () => this.publishPresence())
      .on("presence", { event: "join" }, () => this.publishPresence())
      .on("presence", { event: "leave" }, () => this.publishPresence())
      .subscribe(async (status) => {
        if (this.closed) return;

        if (status === "SUBSCRIBED") {
          this.connected = true;
          await this.channel?.track({
            user_id: this.user.id,
            name: this.user.name,
            online_at: new Date().toISOString(),
          });
          this.dispatch("connect");
          this.publishPresence();
          return;
        }

        // CHANNEL_ERROR / TIMED_OUT / CLOSED
        this.connected = false;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          this.dispatch("connect_error", new Error(`Realtime ${status}`));
        } else {
          this.dispatch("disconnect", status);
        }
      });
  }

  disconnect() {
    this.closed = true;
    this.connected = false;
    if (this.channel) {
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.handlers.clear();
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private dispatch(event: string, ...args: any[]) {
    this.handlers.get(event)?.forEach((h) => {
      try {
        h(...args);
      } catch (err) {
        console.error(`[Chat] handler for "${event}" threw:`, err);
      }
    });
  }

  private publishPresence() {
    if (!this.channel) return;
    const state = this.channel.presenceState();
    this.dispatch("presence:update", Object.keys(state));
  }

  /**
   * Realtime delivers the raw row. The UI expects the joined sender profile,
   * which is what the socket server used to attach.
   */
  private async onMessageInsert(row: any) {
    if (!row?.id) return;

    const { data: full } = await this.supabase
      .from("messages")
      .select("*, sender:profiles!sender_id(id, name, email, role)")
      .eq("id", row.id)
      .single();

    // RLS returns nothing for channels this user is not a member of, so a
    // null result here means the message simply is not ours to see.
    if (!full) return;

    this.dispatch("message:new", full);

    // The socket server resolved mentions server-side and pushed to one user.
    // Every client already receives the insert, so each checks for itself.
    const mentioned = typeof full.content === "string"
      && full.content.includes(`user:${this.user.id}`);
    if (mentioned && full.sender_id !== this.user.id) {
      this.dispatch("notification:mention", { message: full, channelId: full.channel_id });
    }
  }

  private async sendMessage(data: any, callback?: (res: any) => void) {
    try {
      const { channelId, content, type = "text", fileUrl, taskId, metadata } = data || {};
      if (!channelId || (!content && !fileUrl)) {
        callback?.({ ok: false, error: "Message needs content or a file" });
        return;
      }

      // Membership is enforced by the messages_send_members RLS policy.
      const { data: message, error } = await this.supabase
        .from("messages")
        .insert({
          channel_id: channelId,
          sender_id: this.user.id,
          content,
          type,
          file_url: fileUrl || null,
          task_id: taskId || null,
          metadata: metadata || {},
        })
        .select("*, sender:profiles!sender_id(id, name, email, role)")
        .single();

      if (error) throw error;

      // Echo locally so the sender sees it without waiting for the round trip.
      this.dispatch("message:new", message);
      callback?.({ ok: true, message });
    } catch (err: any) {
      console.error("[Chat] Send error:", err.message);
      callback?.({ ok: false, error: err.message || "Failed to send message" });
    }
  }

  private async markSeen(channelId?: string) {
    if (!channelId) return;
    try {
      await this.supabase
        .from("channel_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("channel_id", channelId)
        .eq("user_id", this.user.id);
      this.dispatch("unread:refresh", { channelId });
    } catch (err) {
      console.error("[Chat] Seen error:", err);
    }
  }

  private broadcastTyping(event: string, channelId?: string) {
    if (!this.channel || !channelId || !this.connected) return;
    this.channel.send({
      type: "broadcast",
      event: "typing",
      payload: {
        userId: this.user.id,
        userName: this.user.name,
        channelId,
        typing: event === "typing:start",
      },
    });
  }
}
