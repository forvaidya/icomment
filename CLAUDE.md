# CLAUDE.md — Step 03: Hono Router

## What this step adds

- Hono middleware for JWT extraction (extract once, available to all routes)
- Route organization by resource type (boards, messages)
- Error handling patterns (consistent error responses)
- Request context enriched with user info (email, admin status)
- Foundation ready for Step 04 (user profiles, R2)

## What is explicitly NOT in this step

- New endpoints (same endpoints as Step 02)
- User profiles (deferred to Step 04)
- Durable Objects (still deferred to Step 04)
- WebSocket or real-time messaging
- File attachments or R2 integration
- DB migrations or schema changes

## Done condition

- All Step 02 endpoints (GET /, POST/GET /boards, POST/GET /general_messages) work identically after refactor
- JWT extracted once via middleware, accessible to all routes
- Routes organized for readability (no behavior change)
- Diagnostic page still shows admin/patron welcome
- Code is cleaner and ready for Step 04

## Key decisions locked in

- Hono as HTTP router framework
- Middleware pattern: extract JWT at top level, attach to context
- No changes to endpoint paths or request/response formats
- All existing behavior preserved (refactor only, no feature changes)
- D1 and KV bindings unchanged from Step 02

## Architecture Patterns

### Middleware Stack
- Extract JWT from `Cf-Access-Jwt-Assertion` header
- Decode claims and attach email + admin status to context
- Available to all route handlers

### Route Organization
- Group related routes together (boards, messages)
- Keep diagnostic GET / separate (entry point)
- Error responses consistent format: `{ error: string, status: number }`

### Context Enrichment
Routes receive enriched context with:
- `c.env.DB` — D1 database
- `c.env.KV_ADMIN` — Admin list store
- `c.get('userEmail')` — JWT email (or undefined if unauthenticated)
- `c.get('isAdmin')` — Boolean (true if email in KV_ADMIN)

## What to do next

1. Refactor src/index.ts: extract JWT middleware, organize routes
2. Test all Step 02 endpoints to confirm behavior unchanged
3. Deploy and verify diagnostic page still works
4. Then move to Step 04: User profiles + R2 integration
