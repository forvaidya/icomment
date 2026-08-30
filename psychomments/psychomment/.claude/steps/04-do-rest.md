# CLAUDE.md — Step 04: Durable Objects (REST only)

## What this step adds

- Durable Object class for topics (one instance per topic, keyed by topic ID)
- REST routes to POST and GET topic messages through DO
- DO storage API used for message persistence

## What is explicitly NOT in this step

- WebSocket support (comes in step 05)
- Real-time broadcasting or live connections
- General message CRUD (stays in D1)
- File attachments or R2
- Advanced DO state management

## Done condition

- Topic messages stored in DO, separate from D1
- POST `/topics/:id/messages` works via REST
- GET `/topics/:id/messages` works via REST
- Messages persist across Worker restarts

## Key decisions locked in

- Hono router and JWT middleware from step 03
- D1 for relational data (users, boards, topics, general_messages)
- User identity available in request context
- DO instances keyed by topic ID

## What to do next

1. Create Durable Object class for topic messages
2. Implement DO storage API usage
3. Add POST `/topics/:id/messages` route (routes to DO instance)
4. Add GET `/topics/:id/messages` route (retrieves from DO)
5. Deploy and test message persistence
