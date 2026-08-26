# CLAUDE.md — Step 04: Durable Objects (REST only)

## What this step adds

- Durable Object class for topic message storage
- One DO instance per topic, keyed by topic ID
- REST endpoints to POST and GET topic messages through DO
- DO storage API used for persistence (not WebSocket yet)
- Route topic message requests to the correct DO instance

## What is explicitly NOT in this step

- WebSocket support (comes in step 05)
- Real-time broadcasting or live connections
- General message CRUD (stays in D1)
- File attachments or R2
- Complex DO state management beyond message storage

## Done condition

1. Topic messages are stored in DO, separate from D1
2. POST `/topics/:id/messages` routes to the correct DO instance and stores the message
3. GET `/topics/:id/messages` retrieves messages from DO (with pagination or limits)
4. DO instance is created on first request to a topic
5. Messages are persisted across Worker restarts (DO storage survives)

## Key decisions locked in (from previous steps)

- Workers + CF Access + JWT + Hono router
- D1 for boards, topics, general messages
- User identity available in request context
- DO instances keyed by topic ID

## What to do next

1. Define the Durable Object class for topics
2. Add routes for `/topics/:id/messages` POST and GET
3. Implement message storage in DO using the storage API
4. Deploy and test message persistence
