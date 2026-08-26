# CLAUDE.md — Step 01: Worker + CF Access

## What this step adds

- Bare Cloudflare Worker with Hono router
- CF Access identity gate (email/OTP)
- JWT verification middleware
- Single endpoint that echoes JWT claims back to the client

## What is explicitly NOT in this step

- Database (D1) — comes in step 02
- Persistent storage of any kind
- Message endpoints or business logic
- WebSocket or Durable Objects
- File uploads (R2)

## Done condition

1. Deployed Worker URL requires CF Access login
2. Unauthenticated requests are blocked by Access
3. Authenticated requests receive a 200 response with JWT claims visible (sub, email, at minimum)
4. JWT is verified in the Worker code

## Key decisions locked in (from project brief)

- Cloudflare Workers as compute runtime
- CF Access (not Auth0 or external provider) as auth
- Hono as the HTTP router
- TypeScript + Bun for local development

## What to do next

1. Create a new Worker project with Bun + Hono
2. Add CF Access policy via wrangler (or manually in dashboard if wrangler doesn't support it yet)
3. Add JWT verification middleware
4. Deploy and test with curl, passing Auth token from CF Access
