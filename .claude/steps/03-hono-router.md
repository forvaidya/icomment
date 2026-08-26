# CLAUDE.md — Step 03: Hono Router + JWT Middleware

## What this step adds

- Hono router as the primary HTTP handler (refactor from raw fetch)
- JWT verification middleware applied to all routes
- User identity extraction (sub, email) from JWT and attachment to request context
- All D1 endpoints from step 02 moved into Hono routes
- Consistent error handling and response format

## What is explicitly NOT in this step

- Durable Objects or topic-specific logic
- WebSocket support
- File uploads or R2
- Business logic beyond D1 CRUD
- Rate limiting or advanced middleware

## Done condition

1. All routes are defined in Hono
2. Unauthenticated requests are rejected by middleware (401)
3. Authenticated requests have user identity (sub, email) attached to context
4. All step 02 CRUD operations still work, now through Hono
5. Response format is consistent across endpoints

## Key decisions locked in (from previous steps)

- Workers + CF Access + JWT as identity mechanism
- D1 schema and board/message CRUD working
- TypeScript + Bun for development

## What to do next

1. Refactor existing endpoints into Hono route handlers
2. Add JWT extraction and verification middleware
3. Attach user identity to request context for use in handlers
4. Test all routes with authenticated requests
