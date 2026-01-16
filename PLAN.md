# Guru - Implementation Plan

## Status: Phase 1 Complete ✅

**Phase 0 & 1 Completed:**
- ✅ Project setup with Bun, TypeScript, React, Tailwind
- ✅ Cloudflare Pages + D1 + KV + R2 infrastructure
- ✅ Authentication POC (hardcoded mahesh.local user for development)
- ✅ Idempotent setup automation (3 scripts: setup, teardown, deploy)
- ✅ Database schema with proper indexes and constraints
- ✅ Generated wrangler.toml (not tracked in git)

**Next: Phase 2 - API Implementation**
- [ ] Core API endpoints (discussions, comments, attachments)
- [ ] Rate limiting and validation
- [ ] Admin endpoints for user management
- [ ] Deploy to Cloudflare Pages

---

## Manual Infrastructure Setup

**Single Cloudflare Pages Project with integrated Pages Functions**

This approach uses ONE Pages project that serves both static assets AND API endpoints via Pages Functions.

### Create These Resources

#### 1. Cloudflare Pages Project
- **Project Name:** `guru-comments`
- **Git Integration:** None (manual deployments via CLI)
- **Default Domain:** `guru-comments.pages.dev` (auto-assigned)
- **Custom Domain:** `comments.devops-ranch.in` (optional - add in Pages project settings)

#### 2. D1 Database
- **Database Name:** `icomment`
- **Note:** Save Database ID for wrangler.toml

#### 3. KV Namespace
- **Namespace Name:** `icomment-kv`
- **Note:** Save Namespace ID for wrangler.toml

#### 4. R2 Bucket
- **Bucket Name:** `icomment-attachments`

### wrangler.toml Configuration
Single `wrangler.toml` for Pages + Functions:

```toml
name = "guru-comments"
compatibility_date = "2025-01-16"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "icomment"
database_id = "<YOUR_DATABASE_ID>"

[[kv_namespaces]]
binding = "KV"
id = "<YOUR_KV_NAMESPACE_ID>"

[[r2_buckets]]
binding = "R2"
bucket_name = "icomment-attachments"
```

### Project Structure
```
guru-comments/
├── dist/                    ← Built React SPA (static assets)
│   ├── index.html
│   ├── main.js
│   ├── main.css
│   └── assets/
│
├── functions/               ← Pages Functions (API endpoints)
│   ├── api/
│   │   ├── health.ts
│   │   ├── discussions.ts
│   │   ├── comments.ts
│   │   └── attachments.ts
│   └── _middleware.ts       ← Auth middleware
│
└── wrangler.toml           ← Unified config
```

### How It Works

**Request flow:**
```
User Request → Cloudflare Pages
              ├─ /api/* → Routes to functions/api/* → Pages Function (Worker)
              └─ /* → Serves dist/ static files
```

**Deployment:**
```bash
bun run build              # Compile React → dist/
wrangler pages deploy dist # Deploy to Pages (includes functions/)
```

### Save Infrastructure IDs
Create `.env.local` (git-ignored):
```
CLOUDFLARE_D1_ID=<YOUR_DATABASE_ID>
CLOUDFLARE_KV_ID=<YOUR_KV_NAMESPACE_ID>
CLOUDFLARE_R2_BUCKET=icomment-attachments
CLOUDFLARE_PAGES_PROJECT=guru-comments
CLOUDFLARE_PAGES_DOMAIN=comments.devops-ranch.in
```

### Advantages of Single Project
- ✅ Simpler setup (1 Pages project vs 2 separate services)
- ✅ Shared D1/KV/R2 resources automatically bound
- ✅ Both frontend and API on same domain (no CORS needed)
- ✅ Easier deployments (single `wrangler pages deploy`)
- ✅ Same free tier quotas apply to combined API calls
- ❌ Both UI and API on same domain (optional custom domain)

---

## Project Overview

**Guru** - A self-hosted, private commenting system built on Cloudflare Pages with Pages Functions. Users deploy their own instance. Emphasizes open dialogue and wisdom through community discussion. Features:
- Thread-based discussions with nested comments
- Role-based access control (local + Auth0 users, decoupled admin status)
- File attachment support (R2 storage)
- Client-side React SPA (no SSR due to free tier CPU constraints)
- Feature-flagged Auth0 integration (Auth0-ready, deactivated for POC)
- CLI tools for user & admin management

**Free Tier Deployment:** 10ms CPU limit per request, 100k API requests/day
- Static assets: Unlimited requests (Cloudflare Pages benefit)
- API endpoints: 100k requests/day budget (Pages Functions)

---

## Architecture & Tech Stack Decision

**Deployment Platform:** Cloudflare Pages + Pages Functions (not pure Workers)
- Unlimited static asset requests (critical for SPA)
- Pages Functions = Workers under the hood (same CPU/quota limits)
- Auto-deployed via Git or CLI

**Frontend:** Client-side React SPA (no SSR)
- Built locally with Bun
- Deployed as static HTML/JS/CSS to Pages
- Hydrated by API calls (not server-rendered HTML)
- Tailwind CSS styling with `.icomment-` class customization

**Backend:** Pages Functions (REST API)
- API abstraction layer for all external services
- D1 for relational data
- KV for sessions/cache
- R2 for file attachments

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
- **R2**: PNG attachments (5MB max per file)

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
  deleted_at DATETIME,                -- NULL = not deleted, timestamp = soft deleted

  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_discussions_created_at ON discussions(created_at);
CREATE INDEX idx_discussions_archived ON discussions(is_archived);
CREATE INDEX idx_discussions_deleted ON discussions(deleted_at);
```

**Soft Delete Strategy:**
- Discussions also support soft deletes (consistent with comments)
- `deleted_at IS NULL` = discussion exists
- `deleted_at IS NOT NULL` = discussion soft-deleted
- Queries: Always use `WHERE deleted_at IS NULL` in SELECT statements
- Admin can undelete discussions (soft delete = reversible)

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
  deleted_at DATETIME,                -- NULL = not deleted, timestamp = soft deleted

  FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_comments_discussion ON comments(discussion_id);
CREATE INDEX idx_comments_discussion_parent ON comments(discussion_id, parent_comment_id);
CREATE INDEX idx_comments_parent ON comments(parent_comment_id);
CREATE INDEX idx_comments_author ON comments(author_id);
CREATE INDEX idx_comments_created ON comments(created_at);
CREATE INDEX idx_comments_deleted ON comments(deleted_at);
```

**Soft Delete Strategy:**
- `deleted_at IS NULL` = comment exists
- `deleted_at IS NOT NULL` = comment soft-deleted (audit trail preserved)
- Queries: Always use `WHERE deleted_at IS NULL` in SELECT statements
- Deleted comments with children show `[Comment deleted]` placeholder in UI

### 4. Attachments Table
```sql
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,                -- UUID
  comment_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,            -- 'image/png'
  file_size INTEGER NOT NULL,         -- bytes, max 5242880 (5MB)
  r2_key TEXT NOT NULL,               -- path in R2: attachments/{discussion_id}/{comment_id}/{uuid}-{filename}
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE INDEX idx_attachments_comment ON attachments(comment_id);
```

**Attachment Constraints:**
- Max file size: 5MB (increased from 1MB for high-DPI screenshots)
- Format: PNG only (MIME type validation on upload)
- R2 key structure: `attachments/{discussion_id}/{comment_id}/{uuid}-{sanitized_filename}.png`
- Access: Always requires authentication + permission check (user must have access to parent comment)

---

## Authentication & Authorization

### POC Authentication (Feature-Flagged)

**Environment Variable:** `AUTH_ENABLED` (default: `false` for POC)

**POC Mode (`AUTH_ENABLED=false`):**
- Hardcoded test user: `mahesh.local`
- Type: `local`, `is_admin: true` (admin by default in POC)
- No Auth0 integration active
- All users auto-authenticated with test user context
- Perfect for development and testing features

**Production Mode (`AUTH_ENABLED=true`):**
- Requires Auth0 setup
- Feature flag allows easy transition from POC → production

### User Model: Mixed Authentication

Users can be either `type: 'local'` OR `type: 'auth0'`, but **NOT auto-admin**:
- `type: 'local'` - Email-based local user, no password storage (bcrypt incompatible with 10ms CPU)
- `type: 'auth0'` - Federated user via Auth0, identified by `auth0_sub` claim
- `is_admin` - Boolean flag **decoupled from type**, must be explicitly toggled

**Why no bcrypt for local auth:**
- bcrypt hashing takes 20-50ms per hash (exceeds 10ms CPU limit)
- Auth0-only approach for secure password handling in production

### Admin Management

**Admin Status:** NOT automatic based on user type
- Decoupled from authentication method
- Can be toggled via admin UI or CLI commands
- Only admins can toggle admin status for other users

**CLI Commands for Admin/User Management:**

```bash
# List all users (email, type, admin status)
bun run scripts/list-users.ts

# Toggle admin status for a user
bun run scripts/toggle-admin.ts --user-id <uuid> --admin true/false
```

**Admin Panel UI Component:**
- Accessible only to admin users
- Shows all users with email, type (local/auth0), admin toggle
- Radio button to toggle `is_admin: yes/no`
- Real-time update to user permissions

### Auth0 Integration (Infrastructure Ready)

**Configuration:**
- Client ID (public, safe to expose)
- Client Secret (stay on server)
- Domain (public, safe to expose)
- Redirect URI: `/api/auth/callback`

**Flow (when `AUTH_ENABLED=true`):**
1. User clicks "Login with Auth0" on SPA
2. SPA redirects to `/api/auth/login` (Pages Function)
3. Pages Function redirects to Auth0 with client_id
4. User authenticates at Auth0
5. Auth0 redirects to `/api/auth/callback?code=xxx`
6. Pages Function exchanges code for tokens (server-side, using client_secret)
7. Creates KV session with session_id
8. Sets HttpOnly cookie with session_id
9. Redirects SPA to app
10. SPA now authenticated via secure cookie

**Session Management (KV-based, not JWT):**
- Store session in KV with random UUID key
- HttpOnly, Secure, SameSite=Strict cookie with session_id
- Session TTL: 7 days
- Middleware validates session_id on every API request (~2ms lookup)

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
GET /api/auth/login
Redirects to Auth0 login (when AUTH_ENABLED=true)
In POC mode (AUTH_ENABLED=false), returns hardcoded mahesh.local session

GET /api/auth/callback?code=...
Auth0 callback, sets session cookie with session_id
Stores session in KV, redirects to app

POST /api/auth/logout
Clears session from KV and removes session_id cookie
Returns: { success: true }

GET /api/user
Returns: Current authenticated user { id, username, type, is_admin, created_at }
Auth: Required
Returns 401 if not authenticated
```

### Discussions

```
GET /api/discussions
Query: ?archived=false&limit=20&offset=0
Returns: {
  discussions: [{ id, title, created_by, created_at, updated_at, is_archived, comments_count }],
  total,
  limit,
  offset,
  has_more
}
Auth: Any (public read)
Notes: Filters out soft-deleted discussions

POST /api/discussions
Body: { title }
Returns: { id, title, created_by, created_at, updated_at, is_archived }
Auth: Required (any authenticated user)

GET /api/discussions/:id
Returns: { id, title, created_by, created_at, updated_at, is_archived, comments_count }
Auth: Any (public read)

PATCH /api/discussions/:id
Body: { title?, is_archived? }
Auth: Admin only
Returns: updated discussion object

DELETE /api/discussions/:id
Body: (empty)
Auth: Admin only
Notes: Soft deletes discussion (sets deleted_at). Cascades to comments (via CASCADE constraint).
Returns: { success: true }
```

### Comments

```
GET /api/discussions/:id/comments
Query: ?parent_id=null&limit=50&offset=0 OR ?since=<timestamp>
Returns (nested structure): [
  {
    id,
    discussion_id,
    parent_comment_id,
    author: { id, username, type },
    content,
    created_at,
    updated_at,
    deleted_at,
    children: [ ... ] (recursively nested, only for top-level when parent_id=null)
  }
]
Auth: Any (public read)
Notes:
- parent_id=null returns top-level comments with recursively nested children
- ?since=<ISO_timestamp> returns only comments created after timestamp (for polling)
- Filters out soft-deleted comments (deleted_at IS NULL)
- Response structure: Top-level array with nested children property for each comment

POST /api/discussions/:id/comments
Body: { content, parent_comment_id? }
Returns: { id, content, author: { id, username, type }, created_at, updated_at, parent_comment_id }
Auth: Required (any authenticated user)

PATCH /api/comments/:id
Body: { content }
Auth: Own comment or admin only
Returns: updated comment object

DELETE /api/comments/:id
Auth: Own comment or admin only
Returns: { success: true }
Notes: Soft deletes comment (sets deleted_at). Shows "[Comment deleted]" placeholder in UI.
```

### Attachments

```
POST /api/comments/:id/attachment-upload-url
Body: { filename, file_size }
Returns: { attachment_id, upload_url, r2_key }
Auth: Required (authenticated user must own comment)
Notes:
- Generates signed URL for client-side direct R2 upload
- file_size must be <= 5242880 (5MB)
- filename will be sanitized and stored with UUID
- User has 1 hour to complete upload

GET /api/attachments/:id
Returns: 302 redirect to R2 signed URL
Auth: Required (authenticated user must have access to parent comment's discussion)
Notes: Signed URL expires in 1 hour

DELETE /api/attachments/:id
Auth: Comment author or admin only
Returns: { success: true }
Notes: Deletes attachment metadata and file from R2
```

### Admin - User Management

```
GET /api/admin/users
Query: ?limit=50&offset=0
Returns: { users: [{ id, username, email, type, is_admin, created_at }], total, has_more }
Auth: Admin only

PATCH /api/admin/users/:id
Body: { is_admin: boolean }
Auth: Admin only
Returns: { id, username, email, type, is_admin, created_at, updated_at }
Notes: Toggle admin status for any user
```

---

## Frontend Architecture

### Client-Side React SPA (No SSR)

**Why no SSR:**
- React SSR takes 50-200ms (exceeds 10ms CPU limit)
- SPA approach: Static HTML + JS bundle, API calls after mount
- CPU used only for API endpoints (D1 queries), not rendering
- Bun builds bundle locally, deploy static files to Pages

**Flow:**
1. Pages serves static HTML/JS/CSS (~1ms CPU)
2. Browser downloads bundle
3. React mounts, makes API calls to fetch data
4. Components render with API response data
5. Real-time updates via client-side polling

**Components:**
- `<DiscussionList />` - Lists discussions (fetches via API)
- `<DiscussionThread />` - Single discussion view (nested comments)
- `<CommentTree />` - Renders linked comment list with recursion
- `<CommentItem />` - Single comment, edit/delete actions
- `<CommentForm />` - Add/reply form with optimistic updates
- `<AttachmentUpload />` - File upload to R2 via signed URLs
- `<AdminPanel />` - User list, admin toggle (admin-only)

**Build Process:**
```bash
# Local build (Bun)
bun run build

# Outputs to ./dist/
# - index.html (SPA shell)
# - assets/app-[hash].js (React bundle)
# - assets/styles-[hash].css (Tailwind)

# Deploy to Pages
wrangler pages deploy ./dist
```

**API Data Flow:**
```
React Component
  ↓
fetch('/api/discussions')
  ↓
Pages Function (API)
  ↓
D1 Query (~3-5ms)
  ↓
KV Session Lookup (~2ms)
  ↓
Response JSON (~200 bytes to 10KB)
  ↓
React State Update → Re-render
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

### Phase 0: Project Setup & Foundations
- [ ] Wrangler configuration (D1, KV, R2 bindings)
- [ ] TypeScript setup (tsconfig.json with Workers compatibility)
- [ ] Build configuration (Bun for frontend bundling)
- [ ] D1 schema initialization (with soft delete fields for discussions)
- [ ] Pages Functions directory structure (`/functions`)
- [ ] Environment variables setup (AUTH_ENABLED, branding variables)
- [ ] **Guru Branding Setup:**
  - [ ] Create `public/favicon.svg` (flower icon with purple petals and golden center)
  - [ ] Create `public/logo.svg` (Guru flower logo)
  - [ ] Create `public/index.html` (static HTML shell with favicon link)
  - [ ] Set APP_LOGO_URL to `/logo.svg` in wrangler.toml
  - [ ] Set APP_NAME to `Guru` (prod) and `Guru (Dev)` (dev)
  - [ ] Set BRAND_COLOR to `#a855f7` (purple, can be customized)
- [ ] Health check endpoint (`GET /api/health`)
- [ ] Error handling framework (standardized JSON error responses with error codes)
- [ ] Rate limiting utility (KV-based request tracking)

### Phase 1: Authentication & User Management (POC Mode) ✅ COMPLETED
- [x] Implement `AUTH_ENABLED=false` hardcoded user (mahesh.local, admin)
- [x] User table with `type` and `is_admin` fields
- [x] Auth middleware for KV session validation
- [x] Pages Function auth middleware (validates session on every request) - `functions/_middleware.ts`
- [x] `GET /api/user` endpoint - Return current authenticated user info
- [x] `GET /api/auth/login` endpoint - POC mode returns hardcoded session, production redirects to Auth0
- [x] `POST /api/auth/logout` endpoint - Clear session
- [x] CLI: `list-users.ts` - List all users with type and admin status
- [x] CLI: `toggle-admin.ts` - Toggle admin status for users
- [x] Admin API endpoints: `GET /api/admin/users` and `PATCH /api/admin/users/:id`
- [x] Database utilities: `src/lib/db.ts` - CRUD operations with parameterized SQL
- [x] POC auth utilities: `src/lib/auth-poc.ts` - Hardcoded mahesh.local user logic
- [x] Wrangler config with main branch default (no dev/prod split)

### Phase 2: Core Discussion & Comment API
- [ ] Discussion CRUD API (CREATE, READ, UPDATE, DELETE with permission checks)
  - `POST /api/discussions { title }` (auth required)
  - `GET /api/discussions?archived=false&limit=20&offset=0` (public read)
  - `GET /api/discussions/:id` (public read)
  - `PATCH /api/discussions/:id { title, is_archived }` (admin only)
  - `DELETE /api/discussions/:id` (admin only, soft delete)
- [ ] Comment CRUD API with recursive CTE for nesting
  - `POST /api/discussions/:id/comments { content, parent_comment_id }` (auth required)
  - `GET /api/discussions/:id/comments?parent_id=null` (recursive nested tree, public read)
  - `GET /api/discussions/:id/comments?since=<timestamp>` (for polling, public read)
  - `PATCH /api/comments/:id { content }` (own comment or admin)
  - `DELETE /api/comments/:id` (soft delete: set deleted_at)
- [ ] Rate limiting via KV (prevent spam) - apply to all endpoints except health check
- [ ] Permission checks: Own resource vs. admin privileges
- [ ] Soft delete filtering: Always exclude deleted_at IS NOT NULL from queries

### Phase 3: Frontend - Client-Side React SPA
- [ ] Bun build setup for React + Tailwind
- [ ] Create Pages `/dist` directory with index.html SPA shell
- [ ] React components:
  - `DiscussionList` - List discussions with pagination
  - `DiscussionThread` - View single discussion with nested comments
  - `CommentTree` - Recursive comment rendering
  - `CommentItem` - Single comment with edit/delete buttons
  - `CommentForm` - Add/reply form with optimistic updates
  - `AdminPanel` - User list with admin toggle (admin-only)
- [ ] Client-side state management (React hooks + Context for user/admin status)
- [ ] Client-side polling for updates (`GET /api/discussions/:id/comments?since=<timestamp>`)
- [ ] Tailwind CSS with `.icomment-*` class customization
- [ ] Error handling & loading states

### Phase 4: Attachments (R2 Storage)
- [ ] R2 bucket setup & binding in wrangler.toml
- [ ] Signed URL generation endpoint: `POST /api/comments/:id/attachment-upload-url` (auth required)
- [ ] Client-side direct R2 upload via signed URL (no Worker CPU used)
- [ ] Attachment metadata storage in D1 (with ON DELETE CASCADE to comments)
- [ ] Signed download URL endpoint: `GET /api/attachments/:id` (auth required)
- [ ] Delete attachment endpoint: `DELETE /api/attachments/:id` (comment author or admin)
- [ ] Attachment listing in comment responses
- [ ] Note: No image compression (would exceed CPU limit), PNG validation only
- [ ] Note: Max file size 5MB enforced both client-side and server-side

### Phase 5: Auth0 Integration (Infrastructure Ready, Feature-Flagged)
- [ ] Auth0 configuration (client_id, client_secret, domain)
- [ ] OAuth flow: `/api/auth/login` redirects to Auth0
- [ ] Auth0 callback handler: `/api/auth/callback?code=...`
- [ ] Token exchange (server-side, using client_secret)
- [ ] Create/update user in D1 on first login
- [ ] Session creation in KV (not JWT)
- [ ] Logout endpoint: `POST /api/auth/logout` (clear KV session)
- [ ] Toggle via `AUTH_ENABLED=true` in environment

### Phase 6: Real-Time Updates & Polling
- [ ] Client-side polling implementation (every 10-30 seconds)
- [ ] Efficient comment fetch: `GET /api/discussions/:id/comments?since=<timestamp>`
- [ ] DOM diffing for minimal re-renders
- [ ] Loading indicators during poll
- [ ] Optimistic updates for form submission

### Phase 7: Testing & Deployment
- [ ] Unit tests for permission logic, comment tree traversal
- [ ] Integration tests for D1 CRUD with foreign keys
- [ ] E2E tests: Create discussion → Comment → Reply flow
- [ ] Admin permission tests: Can/cannot delete other users' comments
- [ ] Attachment upload size validation
- [ ] Deployment to Cloudflare Pages
- [ ] Free tier monitoring (request count, KV usage)
- [ ] Documentation for deployment and admin management

---

## File Structure

```
icomment/
├── functions/                           # Pages Functions (API endpoints)
│   ├── _middleware.ts                  # Auth middleware (runs before all routes)
│   ├── api/
│   │   ├── health.ts                  # GET /api/health (health check)
│   │   ├── auth/
│   │   │   ├── login.ts               # GET /api/auth/login (Auth0 redirect)
│   │   │   ├── callback.ts            # GET /api/auth/callback?code=... (OAuth callback)
│   │   │   └── logout.ts              # POST /api/auth/logout
│   │   ├── discussions.ts             # GET/POST /api/discussions
│   │   ├── discussions/[id].ts        # GET/PATCH /api/discussions/:id
│   │   ├── discussions/[id]/comments.ts  # GET/POST /api/discussions/:id/comments
│   │   ├── comments/[id].ts           # PATCH/DELETE /api/comments/:id
│   │   ├── admin/
│   │   │   └── users/[id].ts          # PATCH /api/admin/users/:id
│   │   ├── attachments/
│   │   │   ├── upload-url.ts          # POST /api/comments/:id/attachment-upload-url
│   │   │   └── [id].ts                # GET/DELETE /api/attachments/:id
│   │
│   └── _app.ts                         # (Optional) App initialization
│
├── src/                                 # Frontend React SPA source
│   ├── main.tsx                        # React entry point
│   ├── App.tsx                         # Main app component
│   ├── pages/
│   │   ├── DiscussionList.tsx
│   │   ├── DiscussionThread.tsx
│   │   └── AdminPanel.tsx
│   ├── components/
│   │   ├── CommentTree.tsx
│   │   ├── CommentItem.tsx
│   │   ├── CommentForm.tsx
│   │   └── AttachmentUpload.tsx
│   ├── hooks/
│   │   ├── useDiscussions.ts
│   │   ├── useComments.ts
│   │   └── useUser.ts
│   ├── lib/
│   │   ├── api.ts                     # API client (fetch wrappers)
│   │   ├── types.ts                   # TypeScript types (shared)
│   │   └── auth.ts                    # Auth context/provider
│   └── styles/
│       └── globals.css                # Tailwind + base styles
│
├── scripts/
│   ├── list-users.ts                  # CLI: List all users
│   └── toggle-admin.ts                # CLI: Toggle user admin status
│
├── migrations/
│   └── 0001_init_schema.sql           # D1 schema initialization
│
├── public/                              # Static assets (served as-is by Pages)
│   ├── favicon.svg                     # Favicon (flower icon)
│   ├── logo.svg                        # Guru flower logo (SVG)
│   └── index.html                      # Static HTML shell (served before React)
│
├── dist/                               # Built SPA (generated by Bun)
│   ├── index.html
│   ├── assets/
│   │   ├── app-[hash].js
│   │   └── styles-[hash].css
│
├── wrangler.toml                       # Cloudflare Pages configuration
├── tsconfig.json
├── bunfig.toml                         # Bun config (optional)
├── package.json
├── tailwind.config.js                  # Tailwind customization
├── PLAN.md
├── CLAUDE.md
├── .gitignore
└── README.md
```

**Key Differences from Original Plan:**
- `/functions` instead of `/src/worker.ts` (Pages Functions structure)
- `/src` for frontend React SPA only (not full-stack)
- No `/src/routes` (API is in `/functions/api`)
- No `/src/lib/ssr.ts` (no server-side rendering)
- Build output to `/dist` for Pages deployment

---

## Environment Variables

**In `wrangler.toml`:**
```toml
[env.production]
vars = {
  ENV = "production",
  AUTH_ENABLED = "true",
  MAX_ATTACHMENT_SIZE = "5242880",
  RATE_LIMIT_ENABLED = "true",
  APP_NAME = "Guru",
  APP_LOGO_URL = "https://example.com/logo.png",
  BRAND_COLOR = "#a855f7"
}
d1_databases = [{ binding = "DB", database_id = "xxx" }]
kv_namespaces = [{ binding = "KV", id = "xxx" }]
r2_buckets = [{ binding = "R2", bucket_name = "icomment-attachments" }]

[env.development]
vars = {
  ENV = "development",
  AUTH_ENABLED = "false",
  MAX_ATTACHMENT_SIZE = "5242880",
  RATE_LIMIT_ENABLED = "false",
  APP_NAME = "Guru (Dev)",
  APP_LOGO_URL = "https://example.com/logo.png",
  BRAND_COLOR = "#a855f7"
}
```

**In `.env` (development only, not committed):**
```bash
# Auth0 (only needed if AUTH_ENABLED=true)
AUTH0_DOMAIN=your-auth0-domain.auth0.com
AUTH0_CLIENT_ID=xxxx
AUTH0_CLIENT_SECRET=xxxx
AUTH0_CALLBACK_URL=http://localhost:8788/api/auth/callback

# For Pages dev server
FUNCTIONS_ONLY=false
```

**Runtime Environment Variables (injected by Pages/Workers):**
- `DB` - D1 database binding
- `KV` - KV namespace binding
- `R2` - R2 bucket binding
- `ENV` - "development" | "production"
- `AUTH_ENABLED` - "true" | "false" (feature flag for Auth0)
- `MAX_ATTACHMENT_SIZE` - Max file upload in bytes (default: 5242880 = 5MB)
- `RATE_LIMIT_ENABLED` - "true" | "false" (enable/disable rate limiting)
- `APP_NAME` - Application name displayed in UI (default: "Guru", dev: "Guru (Dev)")
- `APP_LOGO_URL` - URL to app logo/branding SVG (default: `/logo.svg` - Guru flower logo)
- `BRAND_COLOR` - Primary brand color in hex format (default: "#a855f7" - purple)

**Guru Branding:**
- **Name**: "Guru" (meaning teacher, guide, or wise person)
- **Philosophy**: Open dialogue, wisdom through community discussion and shared insights
- **Logo**: Flower icon with purple petals and golden center (SVG in `/public/logo.svg`)
- **Favicon**: Flower icon matching the logo (SVG in `/public/favicon.svg`)
- **Color**: Purple (#a855f7) by default, customizable

---

## Security Considerations

1. **SPA Architecture**: SPA never exposes Auth0 credentials or secrets to browser
   - Auth0 client_id is public (safe)
   - Auth0 client_secret stays on server only
   - All external API calls via Pages Functions (API abstraction)

2. **Authentication**: Feature-flagged Auth0, no local password storage
   - POC uses hardcoded test user (safe for development)
   - Production: Auth0 OAuth2 with PKCE flow
   - No bcrypt (incompatible with 10ms CPU limit)

3. **Session Management**: KV-based sessions, not stateless JWT
   - Random session_id stored in KV (not self-signed JWT)
   - HttpOnly cookies prevent JS access
   - SameSite=Strict prevents CSRF
   - 7-day TTL with secure flags

4. **SQL Injection**: All D1 queries use parameterized statements
   - Never concatenate user input into SQL
   - Use `?` placeholders for all parameters
   - Example: `db.prepare('SELECT * FROM comments WHERE id = ?').bind(commentId)`

5. **CORS**: Restricted to same-origin by default
   - Can be overridden via `CORS_ORIGINS` env variable if needed
   - For self-hosted private system, same-origin is preferred

6. **R2 Attachments**: Signed URLs with authentication requirement
   - User must be authenticated to generate signed URL
   - Verify user has access to parent comment before signing
   - 1-hour signed URL expiration
   - No public bucket access (all attachments private)

7. **Input Validation**:
   - Content length limits (max 10KB per comment)
   - PNG MIME type validation on upload
   - File size limit: 5MB max
   - Filename sanitization (remove special chars, prevent path traversal)

8. **Rate Limiting**: KV-based per-user rate limiting (when RATE_LIMIT_ENABLED=true)
   - **Authenticated users:** 100 read requests/min, 10 write requests/min
   - **Anonymous users:** 30 read requests/min, 0 write requests (cannot create/edit)
   - **Health check:** Exempt from rate limiting
   - **API endpoints:** All non-health endpoints count toward limit
   - Prevents spam and DoS
   - Rate limit keys stored in KV with 1-minute TTL windows

9. **Soft Deletion**: Comments retain audit trail
   - `deleted_at` timestamp instead of hard delete
   - Preserves discussion thread integrity
   - Admin can view deleted comments for audit/recovery

10. **Admin Actions**: Only admins can modify other users' comments
    - Permission check on every PATCH/DELETE
    - Log admin actions (audit trail)
    - is_admin decoupled from user type (explicit toggle)

---

## Testing Strategy

### Unit Tests (Vitest)
- Permission logic: Can user edit/delete comment?
- Comment tree traversal: Recursive query returns correct nesting
- Session validation: Valid/expired/invalid session_ids
- Input sanitization: Filename, content validation
- Rate limiting: Counter logic, time windows

### Integration Tests (Wrangler + D1)
- D1 CRUD operations with foreign keys
- Cascade deletion: Delete discussion → orphaned comments handled
- Soft delete: Comments marked deleted_at, not removed
- Auth0 flow: (skip in POC) Login → user created → session in KV
- Admin toggle: Can toggle is_admin, affects permissions immediately

### E2E Tests (Browser automation)
- POC mode: Hardcoded user logged in automatically
- Create discussion → view in list
- Add comment → appears in discussion
- Reply to comment → nested in tree
- Edit own comment → persists
- Delete own comment → soft delete, shows placeholder
- Admin view other user's comment → can edit/delete
- Non-admin cannot edit/delete others' comments
- Attachment upload: PNG validation, file size limit
- Admin panel: List users, toggle admin status

### Performance Tests
- Discussion list load: < 200ms (D1 query + KV lookup)
- Comment tree render: < 500ms (includes client-side recursion)
- API endpoint CPU time: < 10ms per request (Cloudflare limit)

### Security Tests
- SQL injection: Input with SQL keywords doesn't break queries
- XSS: HTML in comment content is escaped
- CSRF: State-changing requests fail without session cookie
- File upload: Non-PNG files rejected, oversized files rejected
- Unauthorized access: Users without session get 401

---

## Deployment Guide

### Local Development Setup

1. **Clone Repository**
   ```bash
   git clone <your-fork>
   cd icomment
   ```

2. **Install Dependencies**
   ```bash
   bun install
   ```

3. **Setup Local Cloudflare Resources**
   ```bash
   # Authenticate with Cloudflare
   npx wrangler login

   # Create D1 database
   npx wrangler d1 create icomment-db

   # Run migrations to create schema
   npx wrangler d1 execute icomment-db --file migrations/0001_init_schema.sql

   # Create KV namespace for sessions
   npx wrangler kv:namespace create KV

   # Create R2 bucket for attachments
   npx wrangler r2 bucket create icomment-attachments
   ```

4. **Configure wrangler.toml**
   - Update `database_id`, `kv_namespaces`, `r2_buckets` with resource IDs from step 3

5. **Development Mode** (POC, Auth0 disabled)
   ```bash
   # Uses AUTH_ENABLED=false from wrangler.toml [env.development]
   # Hardcoded user: mahesh.local (admin)
   bun run dev
   ```
   Server starts at `http://localhost:8788` (Pages dev server)

6. **Build Frontend**
   ```bash
   bun run build
   # Outputs to ./dist/
   ```

### Production Deployment (Cloudflare Pages)

1. **Push to GitHub**
   ```bash
   git push origin main
   ```

2. **Connect to Cloudflare Pages**
   - Go to https://pages.cloudflare.com
   - Connect your GitHub repository
   - Select `main` branch
   - Build command: `bun run build`
   - Build directory: `dist`

3. **Configure Production Environment** (in Cloudflare Pages)
   - Set `AUTH_ENABLED=true`
   - Add Auth0 credentials (if using Auth0)
   - Bind D1 database as `DB`
   - Bind KV namespace as `KV`
   - Bind R2 bucket as `R2`

4. **Deploy**
   - Pages auto-deploys on git push to main
   - Or manually deploy: `wrangler pages deploy ./dist`

5. **Post-Deployment Checks**
   ```bash
   # Check health endpoint
   curl https://yourdomain.pages.dev/api/health

   # List users (verify database)
   bun run admin:list

   # Monitor free tier usage
   # Dashboard: https://dash.cloudflare.com → Pages → icomment → Analytics
   ```

### Switching from POC to Production Auth0

1. **Create Auth0 Application**
   - Go to https://auth0.com
   - Create new Application (Regular Web Application)
   - Set Callback URLs: `https://yourdomain.pages.dev/api/auth/callback`
   - Copy Client ID, Client Secret, Domain

2. **Add Auth0 Users** (optional)
   - In Auth0 dashboard, create users
   - They will auto-create in iComment on first login

3. **Toggle Auth0 in Production**
   ```bash
   # In Cloudflare Pages environment variables
   AUTH_ENABLED=true
   AUTH0_DOMAIN=xxx.auth0.com
   AUTH0_CLIENT_ID=xxxx
   AUTH0_CLIENT_SECRET=xxxx
   ```

4. **Redeploy**
   - `git commit` and `git push` to trigger Pages deployment
   - Or manually: `wrangler pages deploy ./dist`

### Manage Users & Admin Status

**List all users:**
```bash
bun run admin:list
```
Output:
```
Email                    Type      Admin
mahesh.local            local     yes
user@example.com        auth0     no
admin@example.com       auth0     yes
```

**Toggle admin status:**
```bash
bun run admin:toggle --user-id <uuid> --admin true
```

Or via Admin Panel in UI (accessible only to admins)

---

## API Error Response Format

All error responses follow this standardized format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { "field": "additional context" }
  }
}
```

**Common Error Codes:**
- `UNAUTHORIZED` - No valid session (HTTP 401)
- `FORBIDDEN` - Authenticated but lacks permissions (HTTP 403)
- `NOT_FOUND` - Resource doesn't exist (HTTP 404)
- `BAD_REQUEST` - Invalid input parameters (HTTP 400)
- `VALIDATION_ERROR` - Input validation failed (HTTP 400)
- `RATE_LIMIT_EXCEEDED` - Too many requests (HTTP 429)
- `FILE_TOO_LARGE` - Attachment exceeds size limit (HTTP 413)
- `INVALID_FILE_TYPE` - File is not PNG (HTTP 400)
- `INTERNAL_ERROR` - Server error (HTTP 500)

**Example:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Comment content is required",
    "details": { "field": "content" }
  }
}
```

---

## Known Limitations & Future Enhancements

**Current:**
- PNG attachments only (5MB max)
- Long polling for updates (not real-time)
- Single-instance deployment
- No markdown support in comments

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

### MVP (Minimum Viable Product)
- [ ] **Authentication**: POC mode with hardcoded user, Auth0 infrastructure ready
- [ ] **Discussions**: Create, list, view, archive (admin only)
- [ ] **Comments**: Create, edit own, delete own, recursive tree rendering
- [ ] **Permissions**: Admin can edit/delete any comment, regular users can't
- [ ] **Admin Management**: List users, toggle admin status via CLI and UI
- [ ] **Frontend**: Client-side React SPA with Tailwind CSS
- [ ] **Database**: D1 with cascade deletion and soft-deletes
- [ ] **Deployment**: Cloudflare Pages with 100k request/day free tier
- [ ] **CPU Budget**: All API endpoints < 10ms CPU time (verified)

### POC Phase Success
- [ ] Local dev with `AUTH_ENABLED=false` works end-to-end
- [ ] Hardcoded user (mahesh.local) automatically authenticated
- [ ] Admin panel accessible, can toggle user admin status
- [ ] Discussion → comment → reply flow works
- [ ] Admin can delete/edit any comment, non-admin cannot

### Production Ready (Additional Requirements)
- [ ] Auth0 integration fully functional (`AUTH_ENABLED=true`)
- [ ] Multiple users can log in via Auth0
- [ ] New Auth0 users auto-create in iComment on first login
- [ ] Attachments upload to R2 with signed URLs
- [ ] Rate limiting prevents spam
- [ ] Tests pass: unit, integration, E2E
- [ ] Documentation: Deployment guide, admin guide, user guide
- [ ] Security audit: SQL injection, XSS, CSRF tests pass
- [ ] Free tier monitoring: Request count, KV usage tracked

### Architecture Compliance
- [ ] No SSR (client-side SPA only)
- [ ] No bcrypt (Auth0 for password security)
- [ ] KV sessions instead of JWT signing
- [ ] API abstraction layer (SPA never calls Auth0 directly)
- [ ] Cloudflare Pages deployment (unlimited static requests)
- [ ] Pages Functions for API (100k requests/day budget)
