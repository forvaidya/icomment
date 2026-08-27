# CLAUDE.md — Step 05: Real-Time Global Chat + Cleanup

## What this step adds

- **Durable Objects** for real-time chat hub (broadcast to all connected users)
- **WebSocket** endpoint for live messaging
- **Global chat** in KV (one shared space, everyone sees everything)
  - Key pattern: `chat:{DATE}:{messageId}`
  - Daily rotation (new date → new keys)
  - TTL: 3-day retention
- **Cron job** for automatic cleanup (delete messages >3 days old)
- **User presence** tracking (who's online now)

## What is explicitly NOT in this step

- 1:1 private messaging (deferred to Phase 3)
- Topic/channel scoping (just one global chat)
- Message encryption
- Message editing/deletion
- Typing indicators (Phase 3)
- Message reactions (Phase 3)

## Done condition

- WebSocket endpoint functional (GET /ws → upgrade to WS)
- Connected users receive live messages
- User can send message → broadcast to all connected users
- User presence shows online count
- Cron job deletes KV messages >3 days old
- Chat history NOT persisted across days (by design)
- Load test: 10+ concurrent users broadcasting messages

## Key decisions locked in

- **One global DO** (not per-topic, not per-user)
- **KV for messages** (not D1; daily rotation, no cross-day history)
- **Cron for cleanup** (delete old messages automatically)
- **Simple broadcast** (no private routing, no distributed state)
- **No persistence after 3 days** (EOD purge by design)

## Architecture

### Durable Objects (global-chat)
```
┌─────────────────────────────────────┐
│    Durable Object (global-chat)     │
│  - Tracks connected users           │
│  - Broadcasts messages to all       │
│  - Writes to KV                     │
└─────────────────────────────────────┘
      ↑    ↑    ↑    ↑
      │    │    │    │
   User1 User2 User3 User4 (WebSocket connections)
```

### Message Flow
1. User connects via WebSocket → DO adds to connected set
2. User sends message → DO receives, writes to KV
3. DO broadcasts to all connected users
4. User disconnects → DO removes from connected set

### KV Storage
```
Key: chat:2026-08-27:msg-abc123
Value: {
  user: "mahesh",
  content: "Hello everyone",
  timestamp: "2026-08-27T14:30:00Z"
}

Key: chat:2026-08-26:msg-abc124  (old, will be deleted by cron)
```

### Cron Job
```
Trigger: Daily at 00:00 UTC
Action: Delete all keys where date < (today - 3 days)
Result: Rolling 3-day window of chat history
```

## Service Selection Review
- **Durable Objects**: Stateful compute for real-time broadcast ✅
- **KV**: Time-series chat storage with TTL ✅
- **Cron Triggers**: Scheduled cleanup jobs ✅
- **WebSocket**: Real-time transport ✅

## New Cloudflare Features
- **Durable Objects** — persistent compute instances
- **WebSocket API** — bi-directional messaging
- **Cron Triggers** — scheduled jobs (native to Workers)

## Binding Additions
```toml
[[durable_objects.bindings]]
name = "CHAT"
class_name = "GlobalChat"
script_name = "psychomments"
```

## What to do next

1. Create `src/durable-objects/global-chat.ts` (DO class)
2. Add WebSocket endpoint `GET /ws` in `src/index.ts`
3. Implement message broadcast in DO
4. Add cron job handler for cleanup
5. Store/retrieve messages from KV
6. Test with curl WebSocket (or browser console)
7. Deploy and verify broadcast + cleanup
8. Load test with multiple concurrent users
9. Then move to Step 06: Polish (presence, history load)
