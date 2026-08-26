# CLAUDE.md — Step 02: D1 CRUD

## What this step adds

- D1 database with schema: `users`, `boards`, `topics`, `general_messages`, `reactions`
- Raw fetch-handler endpoints for D1 operations (no Hono router yet, or minimal routing)
- CRUD operations for `general_messages` and `boards` only
- No authentication checks yet (or pass through from step 01)

## What is explicitly NOT in this step

- Hono router refactoring (raw handlers only)
- JWT extraction and user identity binding to requests
- Topic messages (those go to Durable Objects in step 04)
- WebSocket or real-time messaging
- File attachments or R2 integration
- Middleware beyond basic request routing

## Done condition

1. D1 database is created and deployed
2. POST to `/general_messages` stores a message in D1
3. GET from `/general_messages` retrieves stored messages (with pagination or limits)
4. POST/GET to `/boards` work for CRUD
5. All operations tested via curl with raw body payloads

## Key decisions locked in (from previous steps)

- Workers + CF Access as identity gate
- JWT claims available in request context
- Hono or raw fetch handlers for routing

## What to do next

1. Design and write D1 schema (migrations)
2. Create raw fetch handlers for board and general message CRUD
3. Test locally with Wrangler and curl
4. Deploy and verify against live D1
