# CLAUDE.md — Step 01: Worker + CF Access

## What this step adds

- Bare Cloudflare Worker
- CF Access identity gate (email/OTP)
- JWT verification in Worker code
- Single endpoint that echoes JWT claims in the response

## What is explicitly NOT in this step

- Database (D1)
- Router framework (Hono comes in step 03)
- Persistent storage
- Message endpoints or business logic
- WebSocket or Durable Objects
- File uploads (R2)

## Done condition

- Deployed Worker URL requires CF Access login (unauthenticated requests blocked)
- Authenticated requests show JWT claims visible in response

## Key decisions locked in

- Cloudflare Workers as compute runtime
- CF Access as identity gate (no external provider)
- JWT-based request verification

## What to do next

1. Create a new Worker project
2. Gate it behind CF Access:
   - Use wrangler for what it supports (environment bindings, policy setup)
   - Manually configure in Cloudflare dashboard: email whitelists, policy refinements (document the steps)
3. Add JWT verification code in Worker (extract and validate CF Access JWT)
4. Return JWT claims in response for testing
5. Deploy and test with curl
