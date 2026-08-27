# CLAUDE.md — Step 05: Real-Time Global Chat (D1 Polling)

## What this step adds

- **Chat UI page** with simple stateless polling
- **D1 comments table** for persistence
- **Long polling** (poll every 1.5s via GET /comments?since=timestamp)
- **Markdown editor** with live preview (marked.js)
- **Image upload** to R2 with embed support
- **Per-tab, auto-polling** architecture (no WebSocket, no DO)

## Architecture

### Server (Workers)
```
POST /topics/:id/comments
    ↓
Write to D1
    ↓
Return JSON

GET /topics/:id/comments?since={timestamp}
    ↓
Fetch from D1
    ↓
Return only comments created after since
```

### Client (Browser)
```
Page load
    ↓
1. Fetch D1: GET /topics/:id/comments (all)
2. Set lastPoll = latest.created_at
3. setInterval(poll, 1500ms)
    ↓
Every poll: GET /comments?since=lastPoll
    ↓
Render new comments (stateless)
    ↓
Update lastPoll
```

**Why polling instead of WebSocket/DO?**
- Simpler: no DO complexity, no WebSocket 500 errors
- Reliable: HTTP is proven, D1 is source of truth
- Scales: each browser tab independent (no shared state)
- Feels real-time: 1.5s lag < human perception
- Stateless: browser has no state to manage

## Endpoints

### HTTP
- `GET /` — diagnostic page
- `GET /topics` — list all topics
- `POST /topics` — create topic (admin only)
- `GET /topics/:id` — get topic
- `GET /topics/:id/comments` — list comments for topic
- `POST /topics/:id/comments` — create comment, write to D1
- `POST /topics/:id/comments/upload-image` — upload image to R2

**Query parameters:**
- `GET /topics/:id/comments?since=2025-08-27T12:34:56Z` — only comments after since

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
// 1. Initialize polling
let lastPoll = new Date().toISOString();

// 2. On page load
async function loadComments() {
  const res = await fetch(`/topics/${topicId}/comments`);
  const comments = await res.json();
  renderComments(comments);
  if (comments.length > 0) {
    lastPoll = comments[comments.length - 1].created_at;
  }
}

// 3. Poll for new comments
async function pollComments() {
  const res = await fetch(`/topics/${topicId}/comments?since=${lastPoll}`);
  const comments = await res.json();
  if (comments.length > 0) {
    renderComments(comments);
    lastPoll = comments[comments.length - 1].created_at;
  }
}

// 4. Post comment
async function postComment(content) {
  const res = await fetch(`/topics/${topicId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  if (res.ok) {
    pollComments(); // fetch immediately
  }
}

// 5. Render (stateless)
function renderComments(comments) {
  const html = comments.map(c => `
    <div class="comment">
      <strong>${c.user}:</strong> ${marked(c.content)}
      <small>${new Date(c.created_at).toLocaleString()}</small>
    </div>
  `).join('');
  document.getElementById('comments').innerHTML = html;
}

// 6. Initialize
loadComments();
setInterval(pollComments, 1500);
```

## What's NOT in this step

- Durable Objects (abandoned: WebSocket 500 error, polling simpler)
- WebSocket (replaced by polling)
- Client-side state management (polling is stateless)
- Message deduplication (D1 is source of truth)
- localStorage or sessionStorage (no browser state needed)

## Design Decision: Polling vs WebSocket

**Abandoned WebSocket/DO approach** (attempted Step 05) due to:
- WebSocket upgrade returning 500 error in DO handler
- Complex state management (Map, dedup, merge)
- DO adds infrastructure overhead for MVP

**Chosen polling approach**:
- Simple: fetch → render loop
- Reliable: D1 works, HTTP works
- Scalable: no server connection state to track
- Fast enough: 1.5s poll lag unnoticeable to users

## What to do next

1. Deploy and test chat UI
2. Verify polling updates in real-time (1.5s lag)
3. Test image upload and markdown rendering
4. Test multi-tab sync (independent polls)
5. Then move to Step 06: Polish & optimization

## Key Learning Points

- **Polling vs WebSocket trade-off**: simpler polling > complex stateful DO
- **Stateless architecture**: each browser tab independent, no shared state
- **D1 as source of truth**: query by timestamp for incremental updates
- **No client-side state management needed**: polling is stateless
- **Markdown + images**: client-side rendering with preview

---

**Rationale**: Prioritize learning infrastructure (Workers, D1, R2) over building perfect real-time (which polling achieves adequately). Avoid premature complexity.
