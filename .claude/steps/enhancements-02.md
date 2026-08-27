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
**1-on-1 chats**
- Separate namespace from topic messages
- Private to both users
- Notification on new message

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

**WebSocket routing** (Durable Objects)
- Each topic = one DO instance
- Broadcast to connected clients
- Fallback to polling if WS fails

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
