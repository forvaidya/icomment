# Guru Comment System - Deployment Guide

## ✅ Current Status: DEPLOYED TO CLOUDFLARE PAGES

Your application is live and running on Cloudflare Pages!

### Live URLs
- **Main Application**: https://guru-comments.pages.dev
- **Latest Deployment**: https://f29c8da7.guru-comments.pages.dev
- **API Health Check**: https://guru-comments.pages.dev/api/health

## 🔧 How Deployment Works

### Automated Setup
The infrastructure is provisioned with a single command:
```bash
bun run setup
```

This creates:
1. D1 Database (icomment)
2. KV Namespace (icomment-kv) for sessions/cache
3. R2 Bucket (icomment-attachments) for file storage
4. Cloudflare Pages Project (guru-comments)
5. Generates wrangler.toml with actual resource IDs

### Build & Deploy
```bash
# Build frontend + functions
bun run build:all

# Deploy to Cloudflare Pages
bun run deploy
```

The build process:
- Compiles React SPA using Bun
- Includes public assets (HTML, favicon, logo)
- Copies Pages Functions to dist/
- Wrangler handles final bundling and deployment

## 📁 Deployment Structure

```
dist/                           ← Deploy this directory to Pages
├── index.html                  ← React app entry point
├── main.js                     ← React bundle (980KB)
├── main.css                    ← Tailwind styles
├── favicon.svg                 ← Flower icon
├── logo.svg                    ← Guru logo
└── functions/                  ← Pages Functions
    ├── _middleware.ts          ← Request processing
    ├── api/
    │   ├── health.ts           ← Health check endpoint
    │   ├── user.ts             ← User profile endpoint
    │   ├── auth/
    │   │   ├── login.ts
    │   │   └── logout.ts
    │   └── admin/
    │       └── users.ts
    └── ...
```

## 🔐 Environment Variables

### In wrangler.toml (Auto-generated)
```toml
[env.production]
vars = { ENV = "production", AUTH_ENABLED = "true", ... }

[env.preview]
vars = { ENV = "development", AUTH_ENABLED = "false", ... }
```

### Key Variables
- `ENV`: Environment mode (development/production)
- `AUTH_ENABLED`: Toggle authentication (false for POC mode)
- `MAX_ATTACHMENT_SIZE`: File upload limit (5MB)
- `RATE_LIMIT_ENABLED`: Enable rate limiting
- `APP_NAME`: Application name ("Guru")
- `BRAND_COLOR`: Primary color (#a855f7)

## 🗄️ Resource Configuration

All resources are bound via wrangler.toml environment sections:

```toml
[[d1_databases]]
binding = "DB"
database_id = "0fad6251-69cb-4bd6-b321-b69a7efc1707"

[[kv_namespaces]]
binding = "KV"
id = "537345aff4114622b92a3c7e9805daf8"

[[r2_buckets]]
binding = "R2"
bucket_name = "icomment-attachments"
```

Functions access bindings via `context.env.DB`, `context.env.KV`, `context.env.R2`.

## 🚀 Deployment Checklist

### Pre-Deployment
- [ ] All tests passing: `bun run type-check`
- [ ] Build successful: `bun run build:all`
- [ ] No TypeScript errors
- [ ] Database migrations up to date

### Deployment
- [ ] Run: `bun run deploy`
- [ ] Wait for "Deployment complete!" message
- [ ] Verify new deployment URL is live
- [ ] Check health endpoint responds

### Post-Deployment
- [ ] Test health check: `/api/health`
- [ ] Test user endpoint: `/api/user`
- [ ] Verify SPA loads (index.html)
- [ ] Check browser console for errors
- [ ] Monitor Cloudflare dashboard for errors

## 📊 Free Tier Limits & Monitoring

### Daily Quotas
- **API Requests**: 100,000/day (via Pages Functions)
- **D1 Database Reads**: 5,000,000/day
- **D1 Database Writes**: 100,000/day
- **KV Operations**: 100,000/day
- **R2 Storage**: 10GB free per month

### Monitoring
1. Check Cloudflare dashboard: Pages project metrics
2. View deployment logs: Each deploy shows build details
3. Monitor errors: Check Pages deployment logs

### When You Hit Limits
- **API requests**: Upgrade to Workers Paid plan ($5/mo)
- **Database/KV**: Likely won't hit with small team
- **R2 Storage**: Unlikely unless many large files

## 🔄 Continuous Deployment Options

### Option 1: Manual CLI Deployment (Current)
```bash
bun run deploy
```
Quick one-off deployments from command line.

### Option 2: Git Integration (Future)
1. Push to GitHub
2. In Cloudflare Pages dashboard: Connect repo
3. Auto-deploy on every push to `main`
4. Build command: `bun run build:all`
5. Build output: `dist/`

## 🛠️ Troubleshooting

### Deployment Fails
```bash
# Verify authentication
wrangler login

# Check infrastructure exists
bun run setup

# Check build output
ls -la dist/

# Verify wrangler.toml
cat wrangler.toml
```

### API Returns 500 Error
- Check function imports (must be local or inline)
- Verify environment variables are set
- Check Cloudflare dashboard logs for detailed error
- Test locally with: `wrangler pages dev src`

### Database Connection Failed
```bash
# Verify database exists
wrangler d1 list

# Test connection
wrangler d1 execute icomment --remote --file /dev/stdin <<< "SELECT 1"
```

## 📝 Typical Workflow

```bash
# 1. Make changes to code
# ... edit src/, functions/

# 2. Test locally
bun run dev

# 3. Build
bun run build:all

# 4. Deploy
bun run deploy

# 5. Monitor
# Visit deployment URL or Cloudflare dashboard
```

## 🎯 Next Steps

### Phase 2: Core API
- [ ] Discussions API (create, list, view)
- [ ] Comments API (nested trees)
- [ ] Attachments API (R2 integration)

### Phase 3: Production Ready
- [ ] Auth0 integration
- [ ] Custom domain
- [ ] Error handling
- [ ] Rate limiting

### Phase 4: Scale
- [ ] Real-time updates (Durable Objects)
- [ ] Full-text search
- [ ] Email notifications
- [ ] Analytics

## �� References

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Pages Functions Guide](https://developers.cloudflare.com/pages/platform/functions/)
- [D1 Database Documentation](https://developers.cloudflare.com/d1/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)

## 🎉 Deployment Success!

Your Guru Comment System is now deployed and ready for Phase 2 development!

**Next:** Implement core discussion and comment APIs (Phase 2).
