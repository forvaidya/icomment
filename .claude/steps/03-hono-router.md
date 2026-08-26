# CLAUDE.md — Step 03: Hono Router + JWT Middleware

## What this step adds

- Hono as the HTTP router
- Move all D1 endpoints from step 02 into Hono routes
- JWT verification middleware applied to all routes
- Extract user identity (`sub`, `email`) from JWT and attach to request context

## What is explicitly NOT in this step

- Durable Objects or topic message logic
- WebSocket support
- File uploads or R2
- Changes to D1 schema or new tables
- Advanced middleware features

## Done condition

- All routes go through Hono
- Unauthenticated requests are rejected (all routes protected)
- User identity (`sub`, `email`) is extracted and accessible in route handlers
- All step 02 CRUD operations still work

## Key decisions locked in

- Workers + CF Access + JWT as identity mechanism
- D1 schema working (users, boards, topics, general_messages)
- User identity available on every request

## What to do next

1. Introduce Hono router to the Worker
2. Move existing fetch handlers into Hono route definitions
3. Add JWT verification middleware (all routes protected)
4. Extract `sub` and `email` from JWT and attach to request context
5. Test all routes with authenticated requests
