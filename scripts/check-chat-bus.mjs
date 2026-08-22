#!/usr/bin/env node
/**
 * Smallest thing that fails if ChatBus breaks.
 * Run: node scripts/check-chat-bus.mjs
 *
 * Compiles src/lib/chat-bus.ts on its own and drives it with a stub Supabase
 * client — no test framework, no network, no database.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert";

const out = mkdtempSync(join(tmpdir(), "chatbus-"));

try {
  execFileSync(
    process.execPath,
    [
      join("node_modules", "typescript", "bin", "tsc"),
      "src/lib/chat-bus.ts",
      "--outDir", out,
      "--module", "es2020",
      "--target", "es2020",
      "--moduleResolution", "bundler",
      "--skipLibCheck",
    ],
    { stdio: "inherit" }
  );

  const { ChatBus } = await import(pathToFileURL(join(out, "chat-bus.js")).href);

  // ── Stub Supabase ────────────────────────────────────────────────────────
  const calls = { inserted: null, updated: null, sent: [] };
  const ME = "11111111-1111-1111-1111-111111111111";
  const OTHER = "22222222-2222-2222-2222-222222222222";

  const row = (over = {}) => ({
    id: "msg-1",
    channel_id: "chan-1",
    sender_id: OTHER,
    content: "hello",
    ...over,
  });

  let selectRow = row();

  const supabase = {
    from(table) {
      const q = {
        insert(payload) { calls.inserted = { table, payload }; return q; },
        update(payload) { calls.updated = { table, payload }; return q; },
        select() { return q; },
        eq() { return q; },
        single: async () => ({ data: selectRow, error: null }),
        then: undefined,
      };
      // update().eq().eq() resolves without .single()
      q.eq = () => Object.assign(q, { then: (res) => res({ data: null, error: null }) });
      return q;
    },
    channel() { return channelStub; },
    removeChannel() { channelStub.removed = true; },
  };

  const channelStub = {
    removed: false,
    handlers: {},
    on(kind, filter, cb) {
      const key = kind === "postgres_changes" ? "pg" : (filter?.event ?? kind);
      this.handlers[key] = cb;
      return this;
    },
    subscribe(cb) { this.subscribeCb = cb; return this; },
    async track() { this.tracked = true; },
    presenceState() { return { [ME]: [{}], [OTHER]: [{}] }; },
    send(msg) { calls.sent.push(msg); },
  };

  const bus = new ChatBus(supabase, { id: ME, name: "Me", role: "agent" });
  const seen = [];
  bus.on("message:new", (m) => seen.push(["new", m.id]));
  bus.on("notification:mention", () => seen.push(["mention"]));
  bus.on("presence:update", (ids) => seen.push(["presence", ids.length]));
  bus.on("connect", () => seen.push(["connect"]));

  bus.connect();
  await channelStub.subscribeCb("SUBSCRIBED");

  assert.ok(bus.connected, "SUBSCRIBED must mark the bus connected");
  assert.ok(seen.some(([e]) => e === "connect"), "connect must fire");
  assert.ok(seen.some(([e, n]) => e === "presence" && n === 2), "presence must list both users");

  // A message from someone else, not mentioning me → message:new only.
  await channelStub.handlers.pg({ new: row() });
  assert.strictEqual(seen.filter(([e]) => e === "new").length, 1, "insert must emit message:new");
  assert.strictEqual(seen.filter(([e]) => e === "mention").length, 0, "no mention expected");

  // A message from someone else that mentions me → also notification:mention.
  selectRow = row({ id: "msg-2", content: `hey @[Me](user:${ME}) look` });
  await channelStub.handlers.pg({ new: selectRow });
  assert.strictEqual(seen.filter(([e]) => e === "mention").length, 1, "mention must fire");

  // My own mention of myself must not notify me.
  selectRow = row({ id: "msg-3", sender_id: ME, content: `note to self user:${ME}` });
  await channelStub.handlers.pg({ new: selectRow });
  assert.strictEqual(seen.filter(([e]) => e === "mention").length, 1, "self-mention must not notify");

  // Typing broadcasts only go out while connected, and carry the channel.
  bus.emit("typing:start", { channelId: "chan-1" });
  assert.strictEqual(calls.sent.length, 1, "typing:start must broadcast");
  assert.strictEqual(calls.sent[0].payload.typing, true);
  assert.strictEqual(calls.sent[0].payload.channelId, "chan-1");

  bus.emit("typing:stop", { channelId: "chan-1" });
  assert.strictEqual(calls.sent[1].payload.typing, false, "typing:stop must clear");

  // Sending requires content or a file.
  let rejected;
  bus.emit("message:send", { channelId: "chan-1" }, (r) => { rejected = r; });
  assert.strictEqual(rejected.ok, false, "empty message must be rejected");

  // Unknown events must be inert, not throw.
  bus.emit("channel:join", { channelId: "chan-1" });
  bus.emit("totally:unknown", {});

  // Disconnect tears the channel down.
  bus.disconnect();
  assert.ok(channelStub.removed, "disconnect must remove the realtime channel");
  assert.strictEqual(bus.connected, false);

  console.log("✓ chat-bus: presence, message fan-out, mentions, typing, teardown");
} finally {
  rmSync(out, { recursive: true, force: true });
}
