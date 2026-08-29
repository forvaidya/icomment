# Enhancements — Real-Time Global Chat (Phase 2)

Single shared chat space for all authenticated users. Simple, scalable.

## Global Real-Time Chat

**Core:**
- One chat space (everyone sees everything)
- Live messaging via WebSocket (Durable Objects)
- User presence (who's online now)
- Message attribution (name, timestamp, avatar)
- Message history (load past messages)

**Features:**
- Typing indicators ("Mahesh is typing...")
- Message reactions (emoji)
- Search message history
- User status (online, away, idle)

## Why This Over Topic+1:1?

**Simpler architecture:**
- One Durable Object instance (no routing)
- Broadcast to all connected users
- No user-to-user routing complexity
- No offline delivery management
- No distributed state coordination

**Learning focus:**
- DO broadcast patterns
- WebSocket real-time delivery
- Presence management (KV-based)
- Message persistence (D1)
- Scaling (sharding if needed)

**Better for learning:**
- Focus on real-time patterns, not distributed messaging
- Clean DO lifecycle (connect/disconnect)
- Pub/sub simplified (all subscribers = all online users)

## Architecture

**Durable Object (global-chat):**
```
User 1 ──┐
User 2 ──┼─→ DO Instance ←─→ WebSocket Broadcast
User 3 ──┤
User 4 ──┘
```

**Message flow:**
1. User sends message via WebSocket
2. DO receives, stores in D1
3. DO broadcasts to all connected users
4. Frontend updates chat UI

**Presence:**
- KV tracks: user → connection timestamp
- Heartbeat every 30s
- Cleanup on disconnect

## Technical Stack

**New:**
- Durable Objects (broadcast hub)
- WebSocket (real-time transport)

**Existing:**
- D1 (message persistence)
- KV (presence tracking)
- Workers (HTTP → WS gateway)

## Timeline
- **Step 05**: Build global real-time chat (DO + WebSocket)
- **Step 06**: Polish (typing indicators, presence, history)
- **Optional**: Sharding if message throughput scales

---

**Rationale:** Focus on core real-time patterns without distributed routing complexity. 1:1/topics are a separate problem (Phase 3+).
