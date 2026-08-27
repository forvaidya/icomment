# CLAUDE.md — Step 02: D1 CRUD

## What this step adds

- D1 database with schema: `users`, `boards`, `topics`, `general_messages`
- Raw fetch-handler endpoints for D1 operations (no router yet)
- CRUD for `general_messages` and `boards` only

## What is explicitly NOT in this step

- Hono router (comes in step 03)
- JWT extraction or user identity binding to requests
- Topic messages (go to Durable Objects in step 04)
- Reactions (queued for later)
- WebSocket or real-time messaging
- File attachments or R2 integration

## Done condition

- POST and GET `/general_messages` work via curl
- POST and GET `/boards` work via curl
- Full CRUD operations confirmed for both endpoints

## Key decisions locked in

- Workers + CF Access from step 01
- JWT available in request context but not extracted yet
- D1 as owner of relational data (users, boards, topics, general_messages)
- **KV for admin list (not D1)**: Small dataset (config), read-heavy, no complex queries
  - Rationale: KV optimized for reference data; D1 overkill for 2-3 emails
  - Admin list stored as JSON array in KV: `["forvaidya@gmail.com", ...]`
  - User role determined by checking KV membership at request time

## What to do next

1. Design and create D1 schema (migrations for users, boards, topics, general_messages)
2. Create raw fetch handlers for `/general_messages` and `/boards` endpoints
3. Test locally with Wrangler and curl
4. Deploy and verify against live D1
