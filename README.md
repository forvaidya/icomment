# Guru iComment

A self-hosted, private commenting system built on Cloudflare Pages with Pages Functions. Deploy your own instance for thread-based discussions with nested comments, file attachments, and admin management.

## Overview

Guru iComment is a lightweight commenting platform designed for self-hosted deployments:

- **Thread-based discussions** with nested comment trees
- **Role-based access control** with local and Auth0 users
- **File attachments** (PNG images up to 5MB) stored in Cloudflare R2
- **Client-side React SPA** for fast, responsive interactions
- **Feature-flagged Auth0** integration (POC mode uses hardcoded test user)
- **Admin management** CLI tools and UI panel

## Tech Stack

- **Runtime**: Bun (fast JavaScript runtime)
- **Frontend**: React 18 with Tailwind CSS
- **Backend**: Cloudflare Pages Functions
- **Database**: Cloudflare D1 (SQLite)
- **Cache**: Cloudflare KV Store
- **Storage**: Cloudflare R2 (S3-compatible object storage)
- **Authentication**: Auth0 (feature-flagged, optional)

## Features

### POC Mode (Default Development)
- Hardcoded test user: `mahesh.local` (admin)
- No Auth0 integration needed
- Perfect for local development and testing

### Core Features
- **Discussions**: Create discussion threads, archive, soft-delete
- **Comments**: Nested comment trees with edit/delete support
- **Permissions**:
  - Admin users: Full access to all content
  - Regular users: Can edit/delete only their own comments
  - Anonymous users: Can view discussions and comments (no create)
- **Attachments**: Upload PNG images (max 5MB) to discussions
- **Admin Panel**: User management, toggle admin status

### Architecture
- **Client-side SPA**: No server-side rendering (optimizes for 10ms CPU limit)
- **API abstraction layer**: All external service calls through Pages Functions
- **Soft deletes**: Preserve audit trail, allow content recovery
- **Session management**: KV-based sessions with 7-day TTL

## Quick Start

### Installation

```bash
# Install dependencies
bun install

# Authenticate with Cloudflare
npx wrangler login
```

### Local Development

```bash
# Start development server (POC mode with hardcoded user)
bun run dev

# Server runs at http://localhost:8788
# Auto-authenticated as mahesh.local (admin)
```

### Build for Production

```bash
# Build frontend and functions
bun run build:all

# Deploy to Cloudflare Pages
bun run deploy
```

## Configuration

### Environment Variables

Located in `wrangler.toml`. Two environments available:

#### Development
```toml
[env.development]
ENV = "development"
AUTH_ENABLED = "false"          # POC mode: hardcoded user
MAX_ATTACHMENT_SIZE = "5242880" # 5MB
RATE_LIMIT_ENABLED = "false"
APP_NAME = "BadTameez (Dev)"
APP_LOGO_URL = "/logo.svg"
BRAND_COLOR = "#ff0000"
```

#### Production
```toml
[env.production]
ENV = "production"
AUTH_ENABLED = "true"           # Enable Auth0
MAX_ATTACHMENT_SIZE = "5242880"
RATE_LIMIT_ENABLED = "true"
APP_NAME = "BadTameez"
APP_LOGO_URL = "/logo.svg"
BRAND_COLOR = "#ff0000"
```

### Database Setup

```bash
# Create D1 database
bun run db:create

# Run migrations
bun run db:migrate
```

## CLI Commands

### List All Users

```bash
bun run admin:list
```

Output:
```
Email               Type    Admin
mahesh.local        local   yes
user@example.com    auth0   no
admin@example.com   auth0   yes
```

### Toggle Admin Status

```bash
bun run admin:toggle --user-id <uuid> --admin true
```

## API Endpoints

### Authentication

```
GET /api/auth/login
  - Dev mode: Returns hardcoded session
  - Prod mode: Redirects to Auth0

POST /api/auth/logout
  - Clears session cookie and KV session

GET /api/user
  - Returns current authenticated user
  - Requires valid session
```

### Discussions

```
GET /api/discussions?archived=false&limit=20&offset=0
  - List all discussions (public)

POST /api/discussions
  - Create new discussion (auth required)
  - Body: { title }

GET /api/discussions/:id
  - View single discussion (public)

PATCH /api/discussions/:id
  - Update discussion (admin only)
  - Body: { title?, is_archived? }

DELETE /api/discussions/:id
  - Soft-delete discussion (admin only)
```

### Comments

```
GET /api/discussions/:id/comments?parent_id=null
  - Get nested comment tree (public)
  - Supports ?since=<timestamp> for polling

POST /api/discussions/:id/comments
  - Create comment (auth required)
  - Body: { content, parent_comment_id? }

PATCH /api/comments/:id
  - Edit comment (own or admin)
  - Body: { content }

DELETE /api/comments/:id
  - Soft-delete comment (own or admin)
```

### Attachments

```
POST /api/comments/:id/attachment-upload-url
  - Generate signed R2 upload URL (auth required)
  - Body: { filename, file_size }
  - Returns: { attachment_id, upload_url, r2_key }

GET /api/attachments/:id
  - Download attachment (auth required)
  - Redirects to signed R2 URL

DELETE /api/attachments/:id
  - Delete attachment (author or admin)
```

## Styling & Customization

All component classes follow the `.icomment-` prefix pattern:

```
.icomment-container
.icomment-discussion
  .icomment-discussion-header
  .icomment-discussion-title
.icomment-comments
  .icomment-comment
    .icomment-comment-author
    .icomment-comment-content
.icomment-form
  .icomment-textarea
  .icomment-submit-btn
.icomment-attachment
  .icomment-attachment-image
```

Customize with CSS overrides:

```css
.icomment-comment-author {
  font-weight: bold;
  color: #0066cc;
}

.icomment-comment-content {
  line-height: 1.6;
  font-size: 14px;
}
```

## Production Deployment

### 1. Create Auth0 Application (Optional)

```bash
# Go to https://auth0.com
# Create Regular Web Application
# Set Callback URL: https://yourdomain.pages.dev/api/auth/callback
# Copy: Client ID, Client Secret, Domain
```

### 2. Connect to Cloudflare Pages

```bash
# Push to GitHub
git push origin main

# In Cloudflare Pages dashboard:
# 1. Connect GitHub repo
# 2. Select main branch
# 3. Build command: bun run build:all
# 4. Build output directory: dist
```

### 3. Configure Production Environment

In Cloudflare Pages project settings:

```
Environment variables:
  AUTH_ENABLED = true
  AUTH0_DOMAIN = your-domain.auth0.com
  AUTH0_CLIENT_ID = your-client-id
  AUTH0_CLIENT_SECRET = your-client-secret
```

Bind resources:
- D1 Database → `DB`
- KV Namespace → `KV`
- R2 Bucket → `R2`

### 4. Verify Deployment

```bash
# Check health endpoint
curl https://yourdomain.pages.dev/api/health

# List users (verify database)
bun run admin:list
```

## Deployment Targets

### Free Tier Limits

- **Static assets**: Unlimited requests (all SPA HTML/JS/CSS)
- **API requests**: 100,000/day (Pages Functions)
- **CPU per request**: 10ms max
- **D1 database**: 10GB storage
- **KV store**: 100,000 read/write ops/day
- **R2 storage**: 10GB free per month

### Performance Targets

- **First Contentful Paint**: < 2s
- **API response time**: < 100ms (p95)
- **Worker CPU time**: < 10ms per request
- **Bundle size**: < 200KB (gzipped)

## Architecture

### Client-Side SPA Flow

```
Browser
  ↓
[Static HTML/JS from Pages]
  ↓
React App Mounts
  ↓
[fetch('/api/discussions')]
  ↓
[Pages Function]
  ↓
[D1 Query + KV Session Lookup]
  ↓
[JSON Response]
  ↓
React State Update → Re-render
```

### Real-Time Updates

Uses long polling (simpler than WebSocket for serverless):

```javascript
// Client polls every 30 seconds
fetch('/api/discussions/:id/comments?since=<timestamp>')
  .then(response => response.json())
  .then(newComments => updateDOM())
```

## Security

### Authentication & Authorization

- **POC mode**: Hardcoded test user (mahesh.local)
- **Production**: Auth0 OAuth2 with PKCE flow
- **Session storage**: KV-based, not JWT (stateful)
- **Cookies**: HttpOnly, Secure, SameSite=Strict

### Input Validation

- Comment content: Max 10KB
- Attachment filename: Sanitized, no path traversal
- File size: Max 5MB, PNG only
- SQL queries: Parameterized statements (no injection risk)

### Rate Limiting

When enabled (`RATE_LIMIT_ENABLED=true`):

- **Authenticated users**: 100 read/min, 10 write/min
- **Anonymous users**: 30 read/min (no write access)
- **Health check**: Exempt

### Data Protection

- **Soft deletes**: Comments preserve audit trail
- **Cascade deletion**: Discussion delete cascades to comments
- **Attachment access**: Requires authentication + permission check
- **Admin-only actions**: Permission checks on all state changes

## Development

### Project Structure

```
icomment/
├── functions/                    # Pages Functions (API)
│   ├── _middleware.ts
│   ├── api/
│   │   ├── auth/
│   │   ├── discussions/
│   │   └── comments/
│
├── src/                         # Frontend React SPA
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/
│   ├── components/
│   ├── hooks/
│   └── lib/
│
├── scripts/                     # Admin CLI tools
│   ├── list-users.ts
│   └── toggle-admin.ts
│
├── migrations/                  # D1 schema
│   └── 0001_init_schema.sql
│
├── public/                      # Static assets
│   ├── favicon.ico
│   ├── logo.svg
│   └── index.html
│
├── dist/                        # Built SPA (generated)
├── wrangler.toml               # Cloudflare config
├── bunfig.toml                 # Bun config
├── tailwind.config.js
├── package.json
└── README.md
```

### Scripts

```bash
# Development
bun run dev              # Start dev server (POC mode)

# Building
bun run build            # Build frontend
bun run build:functions  # Build functions
bun run build:all        # Build both

# Deployment
bun run deploy           # Deploy to Cloudflare Pages

# Database
bun run db:create        # Create D1 database
bun run db:migrate       # Run migrations

# Admin
bun run admin:list       # List all users
bun run admin:toggle     # Toggle user admin status

# Utilities
bun run type-check       # TypeScript validation
```

## Branding

BadTameez means "arrogant/disrespectful" and represents a no-censorship, all-comments-welcome philosophy.

### Logo & Styling

- **Logo**: Skull icon (SVG at `/public/logo.svg`)
- **Favicon**: Skull icon (ICO at `/public/favicon.ico`)
- **Color**: Red (#ff0000) by default
- **Customizable**: Update `BRAND_COLOR` in wrangler.toml

## Limitations

### Current

- PNG attachments only (5MB max)
- Long polling for updates (not real-time WebSocket)
- Single-instance deployment
- No markdown in comments

### Future Enhancements

- Multiple attachment types (PDF, images)
- Durable Objects for WebSocket real-time
- Markdown support
- Comment reactions/likes
- User profiles
- Full-text search
- Email notifications
- Dark mode toggle
- i18n support

## Support & Documentation

- **Architecture**: See `PLAN.md`
- **Dev Setup**: See `CLAUDE.md`
- **Issues**: Report on GitHub
- **Contributions**: Submit PRs

## License

MIT (Self-hosted, open-source project)
