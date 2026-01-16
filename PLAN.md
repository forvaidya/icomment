# iComment - Implementation Plan

## Project Overview

A self-hosted, private commenting system built on Cloudflare Workers. Users must deploy their own instance. Features thread-based discussions with nested comments, role-based access control (local admins & Auth0 federated users), and attachment support.

---

## Architecture & Tech Stack Decision

### Database: D1 SQL (Recommended over KV)

**Rationale:**
- Structured relational data (users, discussions, comments with hierarchy)
- SQL transactions for data consistency
- Better for querying by user, discussion, time range
- Attachment metadata easily stored with relationships
- KV is better for cache layer (discussion threads)

**Storage Allocation:**
- **D1**: Users, discussions, comments, attachments metadata
- **KV**: Discussion thread cache (for fast reads), user session cache
- **R2**: PNG attachments (1MB max per file)

---

## Database Schema

### 1. Users Table
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,           -- UUID
  username TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,            -- 'local' | 'auth0'
  email TEXT,
  auth0_sub TEXT UNIQUE,         -- Auth0 subject claim
  is_admin BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_type ON users(type);
CREATE INDEX idx_users_auth0_sub ON users(auth0_sub);
```

### 2. Discussions Table
```sql
CREATE TABLE discussions (
  id TEXT PRIMARY KEY,                -- UUID
  title TEXT NOT NULL,
  created_by TEXT NOT NULL,           -- user_id
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_archived BOOLEAN DEFAULT FALSE,
  
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX idx_discussions_created_at ON discussions(created_at);
CREATE INDEX idx_discussions_archived ON discussions(is_archived);
```

### 3. Comments Table (Linked List Structure)
```sql
CREATE TABLE comments (
  id TEXT PRIMARY KEY,                -- UUID
  discussion_id TEXT NOT NULL,
  parent_comment_id TEXT,             -- NULL for top-level comments
  author_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE,
  
  FOREIGN KEY (discussion_id) REFERENCES discussions(id),
  FOREIGN KEY (parent_comment_id) REFERENCES comments(id),
  FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE INDEX idx_comments_discussion ON comments(discussion_id);
CREATE INDEX idx_comments_parent ON comments(parent_comment_id);
CREATE INDEX idx_comments_author ON comments(author_id);
CREATE INDEX idx_comments_created ON comments(created_at);
```

### 4. Attachments Table
```sql
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,                -- UUID
  comment_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,            -- 'image/png'
  file_size INTEGER NOT NULL,         -- bytes, max 1048576
  r2_key TEXT NOT NULL,               -- path in R2
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (comment_id) REFERENCES comments(id)
);

CREATE INDEX idx_attachments_comment ON attachments(comment_id);
```

---

## Authentication & Authorization

### Local Admin Setup

**Default Credentials:**
- Username: `admin`
- Password: `admin`
- Hash stored in D1 (bcrypt with salt)

### CLI Commands (Run via `wrangler tail` or local environment)

```bash
# Reset admin password
bun run scripts/reset-admin-password.ts --password newpassword

# Create local user (becomes admin)
bun run scripts/create-local-user.ts --username john --password secretpass

# List users
bun run scripts/list-users.ts
```

### Auth0 Integration

**Flow:**
1. User clicks "Login with Auth0"
2. Redirect to Auth0 authorization endpoint
3. Auth0 callback to `/api/auth/callback`
4. Extract `sub` claim, create/update user in D1 if not exists
5. Issue worker session cookie (JWT)
6. Redirect to app

**Auth0 Configuration Needed:**
- Client ID
- Client Secret
- Domain
- Redirect URI (e.g., `https://yourdomain.com/api/auth/callback`)

### Permission Model

| User Type | List Discussions | View Comments | Create Comment | Edit Own | Delete Own | Edit Any | Delete Any |
|-----------|-----------------|---------------|----------------|----------|-----------|----------|-----------|
| Local Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Auth0 Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Auth0 User | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Anonymous | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

---

## API Endpoints

### Authentication

```
POST /api/auth/local
Body: { username, password }
Returns: { token, user }

GET /api/auth/auth0
Redirects to Auth0 login

GET /api/auth/callback?code=...
Auth0 callback, sets session cookie

POST /api/auth/logout
Clears session
```

### Discussions

```
GET /api/discussions
Query: ?archived=false&page=1&limit=20
Returns: { discussions: [...], total, hasMore }

POST /api/discussions
Body: { title }
Returns: { id, title, created_at, created_by }

GET /api/discussions/:id
Returns: { discussion, comments_count }

PATCH /api/discussions/:id
Body: { title?, is_archived? }
Auth: Admin only
```

### Comments

```
GET /api/discussions/:id/comments
Query: ?parent_id=null&page=1&limit=50
Returns: { comments: [...], total }
Notes: parent_id=null gets top-level comments

POST /api/discussions/:id/comments
Body: { content, parent_comment_id?, attachment? }
Returns: { id, content, author, created_at }

PATCH /api/comments/:id
Body: { content }
Auth: Own comment or admin
Returns: updated comment

DELETE /api/comments/:id
Auth: Own comment or admin
```

### Attachments

```
POST /api/comments/:id/attachments
Body: FormData with file (PNG, max 1MB)
Returns: { id, filename, r2_url }

GET /api/attachments/:id
Redirect to R2 signed URL (public or private)

DELETE /api/attachments/:id
Auth: Comment author or admin
```

### Admin Users (Auth0)

```
PATCH /api/admin/users/:id
Body: { is_admin: boolean }
Auth: Admin only
Returns: updated user
```

---

## Frontend Architecture

### SSR Rendering (Bun + React)

**Flow:**
1. Worker receives request
2. Fetch discussions + top-level comments from D1
3. Render React components to HTML string
4. Return HTML with hydration data

**Components:**
- `<DiscussionList />` - Lists discussions (SSR)
- `<DiscussionThread />` - Single discussion with all comments (SSR root level)
- `<CommentTree />` - Renders linked list of comments
- `<CommentItem />` - Single comment (interactive, hydrated client-side)
- `<CommentForm />` - Add new comment (client-side)
- `<AttachmentUpload />` - File upload for PNG

### Hydration Strategy

```jsx
// Server: Render full HTML
// Client: Attach event listeners to existing DOM

<script id="__INITIAL_STATE__" type="application/json">
  { discussions, comments, currentUser }
</script>
```

### Real-time Updates (WebSocket or Polling)

**Option A: Long Polling (simpler, serverless-friendly)**
- Client polls `/api/discussions/:id/comments?since=<timestamp>`
- Update DOM with new comments

**Option B: WebSocket (via Durable Objects)**
- Requires Cloudflare Durable Objects
- Real-time sync across all clients

**Recommendation: Start with Long Polling, upgrade to Durable Objects if needed**

### CSS Classes & IDs

**Customizable Classes:**
```
.icomment-container
.icomment-discussion
  .icomment-discussion-header
  .icomment-discussion-title
  .icomment-discussion-meta
  
.icomment-comments
  .icomment-comment
    .icomment-comment-header
    .icomment-comment-author
    .icomment-comment-timestamp
    .icomment-comment-content
    .icomment-comment-actions
    .icomment-comment-children
    
.icomment-form
  .icomment-textarea
  .icomment-submit-btn
  .icomment-attachment-input
  
.icomment-attachment
  .icomment-attachment-image
  .icomment-attachment-preview
```

**User Override Example:**
```css
/* Custom styling */
.icomment-comment-author {
  font-weight: bold;
  color: #0066cc;
}

.icomment-comment-content {
  line-height: 1.6;
  font-size: 14px;
}
```

---

## Implementation Phases

### Phase 1: Core Foundation (Week 1-2)
- [ ] D1 schema setup & migrations
- [ ] Local auth (username/password with bcrypt)
- [ ] User CRUD operations
- [ ] Discussion CRUD API
- [ ] Comment CRUD API (basic structure)
- [ ] CLI tools for admin/user management

### Phase 2: Comments & Attachments (Week 2-3)
- [ ] Linked list comment structure (parent_comment_id)
- [ ] Comment threading API
- [ ] R2 attachment storage (PNG validation)
- [ ] Attachment size limit enforcement (1MB)
- [ ] Attachment deletion

### Phase 3: Frontend & SSR (Week 3-4)
- [ ] React component architecture
- [ ] SSR rendering on Worker
- [ ] Hydration strategy
- [ ] CSS classes & override capability
- [ ] Comment form & submission

### Phase 4: Auth0 Integration (Week 4-5)
- [ ] Auth0 SDK setup
- [ ] OAuth flow implementation
- [ ] User creation on first login
- [ ] Admin designation for Auth0 users
- [ ] Session management

### Phase 5: Real-time Updates (Week 5-6)
- [ ] Long polling implementation
- [ ] DOM diffing & update strategy
- [ ] Optimistic updates for form submission
- [ ] Loading states

### Phase 6: Polish & Deployment (Week 6+)
- [ ] Error handling & validation
- [ ] Testing (unit, integration, e2e)
- [ ] Performance optimization
- [ ] Deployment documentation
- [ ] Environment variable management
- [ ] Security audit

---

## File Structure

```
icomment/
├── src/
│   ├── worker.ts              # Main Cloudflare Worker
│   ├── routes/
│   │   ├── auth.ts            # Authentication endpoints
│   │   ├── discussions.ts
│   │   ├── comments.ts
│   │   └── attachments.ts
│   ├── components/
│   │   ├── DiscussionList.tsx
│   │   ├── DiscussionThread.tsx
│   │   ├── CommentTree.tsx
│   │   ├── CommentItem.tsx
│   │   ├── CommentForm.tsx
│   │   └── AttachmentUpload.tsx
│   ├── lib/
│   │   ├── auth.ts            # Auth logic (local & Auth0)
│   │   ├── db.ts              # D1 queries
│   │   ├── kv.ts              # KV cache helpers
│   │   ├── r2.ts              # R2 upload/delete
│   │   ├── hash.ts            # bcrypt helpers
│   │   └── ssr.ts             # React SSR
│   ├── types/
│   │   └── index.ts           # TypeScript types
│   └── styles/
│       └── icomment.css       # Default styles
├── scripts/
│   ├── reset-admin-password.ts
│   ├── create-local-user.ts
│   └── list-users.ts
├── migrations/
│   └── 0001_init_schema.sql   # Initial D1 schema
├── wrangler.toml              # Cloudflare config
├── tsconfig.json
├── package.json
├── PLAN.md
├── CLAUDE.md
├── .gitignore
└── README.md
```

---

## Environment Variables

```bash
# wrangler.toml
[env.production]
vars = { ENV = "production" }
database_id = "xxx"
kv_namespaces = [{ binding = "CACHE", id = "xxx" }]
r2_buckets = [{ binding = "ATTACHMENTS", bucket_name = "icomment-attachments" }]

# .env (local only)
AUTH0_DOMAIN=your-auth0-domain.auth0.com
AUTH0_CLIENT_ID=xxxx
AUTH0_CLIENT_SECRET=xxxx
AUTH0_CALLBACK_URL=http://localhost:8787/api/auth/callback
```

---

## Security Considerations

1. **CORS**: Configure allowed origins (same-origin only recommended for private system)
2. **CSRF**: Use SameSite cookies, CSRF tokens for state-changing operations
3. **SQL Injection**: All D1 queries use parameterized statements
4. **Password Storage**: Bcrypt with salt for local users (never plain text)
5. **Token Expiration**: JWT tokens expire in 24h, refresh via login
6. **R2 Access**: Signed URLs for attachment downloads, no public bucket
7. **Input Validation**: Content length limits, PNG MIME type check, 1MB file size
8. **Rate Limiting**: Consider adding rate limits to prevent spam
9. **Deletion**: Soft delete comments (is_deleted flag) to maintain discussion integrity
10. **Auth0 Security**: Use PKCE flow, validate ID tokens on backend

---

## Testing Strategy

### Unit Tests
- Auth logic (bcrypt, JWT)
- Comment tree traversal
- Permission checks

### Integration Tests
- Auth0 callback flow
- D1 CRUD operations with foreign keys
- R2 upload/download

### E2E Tests
- Full discussion creation → comment → reply flow
- Admin CRUD other users' comments
- Regular user cannot delete others' comments
- Attachment upload size validation
- SSR rendering + hydration

---

## Deployment Guide

1. **Clone/Fork Repository**
   ```bash
   git clone <your-fork>
   ```

2. **Install Dependencies**
   ```bash
   bun install
   ```

3. **Setup Cloudflare**
   ```bash
   npx wrangler login
   npx wrangler d1 create icomment-db
   npx wrangler d1 execute icomment-db --file migrations/0001_init_schema.sql
   npx wrangler kv:namespace create CACHE
   npx wrangler r2 bucket create icomment-attachments
   ```

4. **Create Auth0 App** (optional)
   - Go to auth0.com, create application
   - Set callback URL to `https://yourdomain.com/api/auth/callback`
   - Copy credentials to `.env`

5. **Deploy**
   ```bash
   bun run deploy
   ```

6. **Set Admin Password**
   ```bash
   bun run scripts/reset-admin-password.ts --password yournewpassword
   ```

---

## Known Limitations & Future Enhancements

**Current:**
- PNG attachments only (1MB max)
- Long polling for updates (not real-time)
- Single-instance deployment

**Future:**
- Multiple attachment types (PDF, images)
- Durable Objects for WebSocket real-time
- Markdown support in comments
- Comment reactions/likes
- User profiles & activity
- Search/full-text search
- Email notifications
- Comment export (JSON/PDF)
- Dark mode toggle
- i18n support

---

## Success Criteria

- ✓ Users can create discussions and comments
- ✓ Nested comments (linked list structure) render correctly
- ✓ Role-based access control enforced
- ✓ Attachments upload to R2 with size/type validation
- ✓ SSR rendering with immediate client-side hydration
- ✓ New comments appear without page refresh
- ✓ CSS fully customizable via class overrides
- ✓ Deploy-your-own model (no shared backend)
- ✓ Local admin + Auth0 users working together
