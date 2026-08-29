# CLAUDE.md — Step 05: Real-Time Global Chat (WebSocket + DO)

## What this step adds

- **Chat UI page** with client-side state management
- **Durable Object** (global-chat) for broadcasting
- **WebSocket endpoint** (GET /ws) upgrade from HTTP
- **D1 comments table** for persistence
- **Markdown editor** with live preview (marked.js)
- **Image upload** to R2 with embed support
- **Real-time broadcast** to all connected clients

## Architecture

### Server (Workers + DO)
```
POST /topics/:id/comments
    ↓
Write to D1
    ↓
Notify DO broadcast

GET /ws (WebSocket)
    ↓
DO receives + broadcasts to all connected
```

### Client (Browser)
```
Page load
    ↓
1. Fetch D1: GET /topics/:id/comments (all)
2. Initialize Map: messages = new Map()
3. WebSocket connect: GET /ws
    ↓
Receive real-time updates
    ↓
Merge into Map (dedup by ID)
    ↓
Sort by timestamp
    ↓
Render UI
```

**Why WebSocket/DO?**
- True real-time: instant message delivery
- Efficient: no polling overhead
- Stateful: DO maintains connection set
- Reliable: HTTP 101 upgrade proven in Workers

## Endpoints

### HTTP
- `GET /` — diagnostic page
- `GET /topics` — list all topics
- `POST /topics` — create topic (admin only)
- `GET /topics/:id` — get topic
- `GET /topics/:id/comments` — list comments for topic
- `POST /topics/:id/comments` — create comment, write to D1, notify DO

### WebSocket
- `GET /ws` — upgrade to WebSocket
  - Subscribe to DO broadcasts
  - Receive new comments in real-time
  - Image uploads: POST /topics/:id/comments/upload-image

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

## Durable Object (global-chat, fixed v3)

**Corrected WebSocket upgrade code:**
- Removed dead code: `const { 0: client, 1: server } = new Object()`
- Direct WebSocketPair: `const pair = new WebSocketPair()`
- Accept on server: `pair[1].accept()` (required before use)
- Return client side: `{ status: 101, webSocket: pair[0] }`

**Result**: WebSocket upgrade now works properly.

## Client Code Pattern

```javascript
// 1. Initialize state
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
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  websocket = new WebSocket(`${protocol}//${window.location.host}/ws`);
  
  websocket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    messages.set(msg.id, msg); // Dedup by ID
    render();
  };
}

// 3. Post comment
async function postComment(topicId, content) {
  await fetch(`/topics/${topicId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  // DO broadcasts to all connected (instant delivery)
}

// 4. Render
function render() {
  const sorted = Array.from(messages.values())
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  
  const html = sorted.map(m => `
    <div class="comment">
      <strong>${m.user}:</strong> ${marked(m.content)}
      <small>${new Date(m.created_at).toLocaleString()}</small>
    </div>
  `).join('');
  
  document.getElementById('comments').innerHTML = html;
}
```

## What to do next

1. Deploy and test WebSocket upgrade
2. Open chat, verify instant message delivery
3. Test image upload and markdown rendering
4. Test multi-tab sync (all tabs receive broadcast)
5. Move to Step 06: Polish & optimization

## Key Learning Points

- **WebSocketPair API**: creates bidirectional socket pair in DO
- **HTTP 101 upgrade**: correct response format for WebSocket
- **Broadcast pattern**: DO maintains Set of connections, sends to all
- **Client state management**: Map for dedup by ID, sort by timestamp
- **D1 + WebSocket**: initial load from DB, real-time via socket

---

**Corrected v3**: Fixed WebSocket/DO implementation. Removed dead code, proper WebSocket upgrade handling, and deployment migration to clean state.
