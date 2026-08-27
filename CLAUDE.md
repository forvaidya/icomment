# CLAUDE.md — Step 05: Real-Time Global Chat + DO Broadcast

## What this step adds

- **Chat UI page** with client-side state management
- **Durable Object** (global-chat) for broadcasting
- **WebSocket endpoint** (GET /ws) upgrade from HTTP
- **D1 comments table** (if not exists, create schema)
- **KV storage** for daily messages (optional, deferred)
- **Real-time broadcast** to all connected clients
- **Client-side merging** (D1 initial load + WebSocket real-time)
- **Auto-dedup** by message ID, sort by timestamp

## Architecture

### Server (Workers + DO)
```
POST /topics/:id/comments
    ↓
Write to D1
    ↓
Notify DO

GET /ws (WebSocket)
    ↓
DO receives + broadcasts to all connected
```

### Client (Browser)
```
Page load
    ↓
1. Fetch D1: GET /topics/:id/comments
2. Initialize Map: messages = new Map()
3. WebSocket connect: GET /ws?topic={id}
    ↓
Receive real-time updates
    ↓
Merge into Map (dedup by ID)
    ↓
Sort by timestamp
    ↓
Render UI
```

## Client-Side State Management

**Data structure (browser RAM):**
```javascript
const messages = new Map([
  ["msg-1", { id, topic_id, user, content, created_at }],
  ["msg-2", { ... }],
  ...
]);
```

**Operations:**
1. **Load initial**: Fetch D1 → populate Map
2. **Receive real-time**: WebSocket → messages.set(id, msg)
3. **Dedup**: Map.set() auto-dedupes by ID
4. **Sort & render**: Array.from(messages.values()).sort(by timestamp)

**Why Map?**
- O(1) dedup by ID
- No duplicates by design
- Easy to sort: convert to array, sort, render

## Endpoints

### HTTP
- `GET /` — diagnostic page
- `GET /topics` — list all topics
- `POST /topics` — create topic (admin only)
- `GET /topics/:id` — get topic
- `GET /topics/:id/comments` — list comments for topic
- `POST /topics/:id/comments` — create comment, notify DO

### WebSocket
- `GET /ws` — upgrade to WebSocket
  - Subscribe to DO broadcasts
  - Receive new comments in real-time
  - Send new comments back (or use HTTP POST)

## Durable Object (global-chat)

**Responsibilities:**
- Track connected clients (WebSocket connections)
- Broadcast new comments to all connected
- No storage (stateless)
- Per-message: receive → broadcast

**Code pattern:**
```typescript
class GlobalChat {
  constructor(state) {
    this.clients = new Set();
  }

  async handleMessage(msg) {
    // Broadcast to all connected clients
    this.clients.forEach(ws => {
      ws.send(JSON.stringify(msg));
    });
  }

  async onOpen(ws) {
    this.clients.add(ws);
  }

  async onClose(ws) {
    this.clients.delete(ws);
  }
}
```

## D1 Schema (comments table)

```sql
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (topic_id) REFERENCES topics(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_comments_topic_id ON comments(topic_id);
CREATE INDEX idx_comments_created_at ON comments(created_at);
```

## Client Code Pattern

```javascript
// 1. Initialize
const messages = new Map();
let websocket;

// 2. On page load
async function loadChat(topicId) {
  // Fetch initial from D1
  const res = await fetch(`/topics/${topicId}/comments`);
  const initial = await res.json();
  
  initial.forEach(msg => messages.set(msg.id, msg));
  render();

  // Connect WebSocket
  websocket = new WebSocket(`/ws?topic=${topicId}`);
  websocket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    messages.set(msg.id, msg); // Dedup by ID
    render(); // Re-render
  };
}

// 3. Post comment
async function postComment(topicId, content) {
  const res = await fetch(`/topics/${topicId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  // DO will broadcast to all (including self)
}

// 4. Render
function render() {
  const sorted = Array.from(messages.values())
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  
  const html = sorted.map(m => `
    <div class="comment">
      <strong>${m.user}:</strong> ${m.content}
      <small>${new Date(m.created_at).toLocaleString()}</small>
    </div>
  `).join('');
  
  document.getElementById('comments').innerHTML = html;
}
```

## What to do next

1. Add D1 migration for comments table (if needed)
2. Create Durable Object class (global-chat)
3. Add WebSocket endpoint (GET /ws)
4. Add comment CRUD endpoints (POST /topics/:id/comments)
5. Create chat UI page (GET /topics/:id/chat)
6. Implement client-side state management (Map, fetch, merge)
7. Test: open two browser tabs, post comment, verify real-time sync
8. Deploy and test

## Key Learning Points

- **Stateless DO** (no message storage, just broadcast)
- **Client-side state** (each browser tab independent)
- **WebSocket broadcast** (one message to all subscribers)
- **D1 persistence** (source of truth)
- **Dedup pattern** (Map by ID)
- **Ordering** (sort by timestamp)

---

**Rationale**: Focus on infrastructure (DO, WebSocket, D1). Browser rendering/optimization deferred.
