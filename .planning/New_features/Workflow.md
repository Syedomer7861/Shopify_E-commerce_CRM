# CureForever CRM — Internal Chat System Prompt

Build an internal real-time chat system inside the CureForever CRM. I already have the design system, colors, and component library. Focus only on logic, features, and implementation details below.

---

## Core Rule — Auth Gate

Every single chat feature (loading messages, sending messages, connecting to WebSocket, viewing channels) must first verify the user has an active CRM session.

```js
// WebSocket connection guard
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const user = verifySessionToken(token); // your existing CRM auth
  if (!user) return next(new Error("Unauthorized"));
  socket.user = user;
  next();
});
```

If the token is missing, expired, or invalid → disconnect immediately. No chat UI should render at all for unauthenticated users.

---

## Tech Stack

- **Real-time:** Socket.io (WebSocket with polling fallback)
- **Database:** Supabase (PostgreSQL) — for storing messages, channels, members
- **File uploads:** Supabase Storage — for images and attachments
- **Notifications:** Web Push API for browser notifications when tab is not active
- **Frontend:** React with hooks

---

## Database Schema

```sql
-- Channels (group conversations)
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,              -- e.g. "general", "agents-only"
  type TEXT NOT NULL,              -- "group" | "direct"
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  is_archived BOOLEAN DEFAULT false
);

-- Channel members
CREATE TABLE channel_members (
  channel_id UUID REFERENCES channels(id),
  user_id UUID REFERENCES users(id),
  role TEXT DEFAULT 'member',      -- "admin" | "member"
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id),
  sender_id UUID REFERENCES users(id),
  content TEXT,
  type TEXT DEFAULT 'text',        -- "text" | "image" | "file" | "task_link"
  file_url TEXT,                   -- filled if type is image or file
  task_id TEXT,                    -- filled if type is task_link
  is_pinned BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false, -- soft delete only
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Message receipts (seen/delivered)
CREATE TABLE message_receipts (
  message_id UUID REFERENCES messages(id),
  user_id UUID REFERENCES users(id),
  status TEXT,                     -- "delivered" | "seen"
  at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
```

---

## Chat Layout (UI Structure)

```
┌──────────────────────────────────────────────────────────┐
│  Left Sidebar (260px)       │  Chat Panel (flex-grow)    │
│                             │                            │
│  Search channels/users      │  Channel name + members    │
│  ─────────────────          │  ─────────────────────     │
│  CHANNELS                   │                            │
│  # general                  │   [Message bubbles area]   │
│  # agents-only              │                            │
│  # admin-ops                │   Typing indicator         │
│  ─────────────────          │  ─────────────────────     │
│  DIRECT MESSAGES            │  [Input box + attach + send]│
│  • Uzma                     │                            │
│  • Sadhana                  │                            │
│  • Mukesh                   │                            │
└─────────────────────────────┴────────────────────────────┘
```

---

## Channels — Default Setup

Create these channels automatically on first install. Do not let agents create channels.

| Channel          | Access                                   |
| ---------------- | ---------------------------------------- |
| `#general`       | All logged-in users                      |
| `#agents-only`   | Role === "Agent" only                    |
| `#admin-ops`     | Role === "Admin" only                    |
| `#announcements` | All users can read, only Admins can post |

**Channel creation rules:**

- Only Admins can create new channels
- Only Admins can archive or delete channels
- Agents can only join channels they are already a member of — they cannot browse or discover hidden channels

---

## Direct Messages

- Any user can start a DM with any other logged-in user
- DM channel is created automatically on first message: `type = "direct"`, members = [user1, user2]
- If a DM channel already exists between two users, reuse it — never create duplicates
- DM list in sidebar shows the other person's name, avatar, online status dot, and last message preview (max 40 chars, truncate with "...")

---

## Task-Linked Chat

- Every task in the CRM has a dedicated chat thread
- Thread channel name = `task-{taskId}` (e.g. `task-4821`)
- Only the agent assigned to that task and admins can see the thread
- Inside the task view, a "Team Chat" tab opens the task thread inline (not in the main chat panel)
- Messages in task threads are searchable from the main search

---

## Real-Time Events (Socket.io)

### Events the server emits to clients:

```js
"message:new"; // new message in a channel the user is a member of
"message:updated"; // message was edited
"message:deleted"; // message was soft-deleted
"message:pinned"; // a message was pinned in a channel
"user:typing"; // someone is typing in a channel
"user:stop_typing"; // someone stopped typing
"user:status_change"; // a user's online status changed
"channel:created"; // a new channel was created (admin only)
"channel:archived"; // a channel was archived
"notification:mention"; // the current user was @mentioned somewhere
```

### Events the client emits to server:

```js
"message:send"; // user sends a message
"message:seen"; // user viewed messages up to a certain ID
"typing:start"; // user started typing (debounce — emit only once per 3s)
"typing:stop"; // user stopped typing (emit after 2s of no keystrokes)
```

---

## Sending a Message — Full Flow

```js
// Client sends
socket.emit("message:send", {
  channelId: "uuid",
  content: "Hey, can you check Task #4821?",
  type: "text",
});

// Server:
// 1. Verify sender is a member of channelId
// 2. Insert into messages table
// 3. Broadcast "message:new" to all other members of that channel
// 4. Detect @mentions in content — emit "notification:mention" to mentioned users
// 5. Return the saved message object to the sender as confirmation
```

---

## Message Features

### Typing Indicator

- Client emits `typing:start` on first keystroke, then again every 3 seconds while still typing
- Client emits `typing:stop` 2 seconds after last keystroke
- Server broadcasts to other channel members
- Show "Uzma is typing..." below the message list
- If multiple people typing: "Uzma and Sadhana are typing..."
- If more than 2: "3 people are typing..."

### Seen / Delivered Receipts

- Mark all messages in a channel as "delivered" when the user's socket connects to that channel
- Mark messages as "seen" when the user scrolls them into view (use IntersectionObserver)
- In DMs show a single tick (delivered) and double tick (seen) on each message
- In group channels show seen count: "Seen by 3" on hover

### @Mentions

- Typing `@` in the input box opens a dropdown of channel members
- Selecting a name wraps it in a mention tag: `<mention userId="uuid">@Uzma</mention>`
- Mentioned user receives a browser notification and a red badge on the chat icon even if they are on a different tab
- Mentioned messages are highlighted with an accent left border in the message list

### Message Editing

- Sender can edit their own message within 15 minutes of sending
- After editing, show "(edited)" label next to the timestamp
- Editing is not allowed after 15 minutes
- Admins can never edit other people's messages

### Message Deletion

- Agents can delete their own messages within 5 minutes of sending
- Admins can delete any message at any time
- Deletion is soft-delete only — store `is_deleted = true`, replace content with "This message was deleted" in the UI
- Never physically remove from database

### Pinned Messages

- Admins only can pin messages
- Pinned messages appear in a collapsible "Pinned" section at the top of the channel
- Max 5 pinned messages per channel — pinning a 6th unpins the oldest automatically

---

## File & Image Sharing

- User clicks the attach icon in the input bar to upload a file or image
- Allowed types: JPG, PNG, PDF, DOCX, XLSX — max 10MB per file
- Upload flow:
  1. File is uploaded to Supabase Storage at path `chat/{channelId}/{messageId}/{filename}`
  2. A signed URL (valid 24 hours) is stored in `messages.file_url`
  3. Message is sent with `type = "image"` or `type = "file"`
- Images render inline as thumbnails (max 300px wide) in the message bubble
- Non-image files render as a download card showing filename, file size, and a download button
- Reject and show an error if file exceeds 10MB or is a disallowed type

---

## Search

- Search bar at the top of the left sidebar
- Searching queries both channel names and message content
- Results grouped into two sections: "Channels" and "Messages"
- Clicking a message result opens that channel and scrolls to that message (highlight it for 2 seconds)
- Search is scoped — users only see results from channels they are a member of
- API: `GET /api/chat/search?q={query}&userId={userId}`

---

## Unread Count & Notifications

- Unread badge on the chat icon in the main CRM nav — shows total unread message count across all channels
- Each channel in the sidebar shows its own unread count bubble
- Badge disappears when user opens the channel and scrolls to the bottom
- Browser push notification when:
  - User receives a DM and the tab is not active
  - User is @mentioned anywhere and the tab is not active
  - Notification text: "Uzma: Hey, can you check Task #4821?" (sender name + message preview)
- Clicking the notification opens the CRM and jumps to that channel

---

## Permissions Matrix

| Action                            | Agent                  | Admin             |
| --------------------------------- | ---------------------- | ----------------- |
| Send message in #general          | ✅                     | ✅                |
| Send message in #announcements    | ❌                     | ✅                |
| Start a DM                        | ✅                     | ✅                |
| Create a channel                  | ❌                     | ✅                |
| Archive a channel                 | ❌                     | ✅                |
| Pin a message                     | ❌                     | ✅                |
| Delete own message (within 5 min) | ✅                     | ✅                |
| Delete any message                | ❌                     | ✅                |
| Edit own message (within 15 min)  | ✅                     | ✅                |
| Edit another user's message       | ❌                     | ❌                |
| Upload files                      | ✅                     | ✅                |
| Search messages                   | ✅ (own channels only) | ✅ (all channels) |

---

## Online Status in Chat

- Reuse the existing CRM agent status system (Online / Away / Offline)
- Show a colored dot next to each user's name in the DM list and in channel member lists
- Status updates in real-time via the same WebSocket connection — no separate fetch needed
- If a user's CRM session expires, their status automatically changes to Offline

---

## Message Pagination (Infinite Scroll)

- Load the last 50 messages when a channel is opened
- When user scrolls to the top, fetch the previous 50 messages (`GET /api/chat/messages?channelId=uuid&before=messageId&limit=50`)
- Show a loading spinner at the top while fetching older messages
- Stop fetching when the API returns fewer than 50 messages (start of conversation)
- New messages always append at the bottom without any fetch

---

## Edge Cases

- User loses internet mid-conversation → Socket.io auto-reconnects, re-fetches missed messages since last received message ID on reconnect
- User sends a message while offline → queue it locally, send automatically when connection restores, show "Sending..." status on the bubble
- Two users send messages at the exact same time → order by `created_at` timestamp from the server, never by client time
- User opens the same CRM in two tabs → both tabs receive messages in real-time, unread count syncs across tabs via `localStorage` event
- Channel is archived while user is inside it → redirect them to `#general` and show a toast "This channel has been archived"
- File upload fails mid-transfer → show error on the attachment preview, do not send the message, allow retry
