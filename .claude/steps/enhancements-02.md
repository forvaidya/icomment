# Enhancements — Real-Time Chat (Phase 2)

Features for logged-in users. Parked after Steps 01-06 complete.

## Real-Time Chat Features

### Core
**Live messaging in topics**
- WebSocket connection per topic (via Durable Objects)
- Message delivery to all connected participants
- Delivery status (sent, received, read)
- Timestamp & user attribution

**User presence**
- Show who's online in a topic
- Join/leave notifications
- Last seen timestamp

### Engagement
**Typing indicators**
- Show "X is typing..." when user has unsent text
- Clear after 3s inactivity

**Message reactions**
- Emoji reactions on messages
- React/unreact via WebSocket
- Reaction count per emoji

**Pinned messages**
- Mark important messages in topic
- Searchable pin history

### Direct Messaging
**1-on-1 chats (Private conversations)**
- Separate namespace from topic messages
- Private to both users (only they can see)
- Real-time delivery + notifications
- Examples: personal invites, casual asks ("Are you willing to join Goa trip this weekend?"), off-topic chat

**Group DMs**
- Create group chat (3+ users)
- Invite/remove users
- Leave group option

### Search & History
**Message search**
- Full-text search within topic
- Filter by user, date range, reaction
- Search across all DMs

**Chat history**
- Load older messages (pagination)
- Archive/mute topics
- Export chat history

## Technical Considerations

### Topic Chat (Simple)
**WebSocket routing** (Durable Objects)
- Each topic = one DO instance
- Broadcast to all connected clients
- Fallback to polling if WS fails

### 1:1 Chat (Complex — new patterns)
**User routing & presence**
- Service discovery: which DO/server is user on?
- KV-based session registry (user → connection ID)
- Presence heartbeat (keep-alive)

**Offline delivery**
- Queues for pending messages
- Push/email notifications
- Message durability until read

**State coordination**
- Both users' DOs must sync (or use relay server)
- Exactly-once delivery (dedup on retry)
- Read receipts (bidirectional confirmation)

**Notification strategy**
- Push notifications (browser)
- Email digests (if user offline)
- In-app badges

**Storage**
- Messages stay in D1 (queryable)
- Real-time state in DO (transient)
- Presence tracked in KV (session-based)

**Rate limiting**
- Messages/min per user per topic
- Typing indicator throttle
- Reaction spam prevention

## Timeline
- **Step 07**: DM infrastructure
- **Step 08**: Search + history
- **Step 09**: Reactions + engagement features

---

**Dependencies**: Steps 01-06 (WebSocket + DO + auth)
