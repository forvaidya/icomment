# CLAUDE.md — Step 05: Durable Objects + WebSocket

## What this step adds

- WebSocket upgrade handler in Worker for topic connection
- DO accepts and holds WebSocket connections from clients in memory
- Broadcast new messages to all connected clients on a topic

## What is explicitly NOT in this step

- File attachments or R2 uploads
- Advanced features (reactions, read cursors, etc.)
- Rate limiting
- Message history over WebSocket (stay on REST for history)
- Client-side reconnection logic

## Done condition

- GET `/topics/:id/ws` upgrades to WebSocket
- Two browser tabs on the same topic see each other's messages live
- New messages posted via REST are broadcasted to WebSocket clients
- Disconnected clients cleaned up from DO memory

## Key decisions locked in

- DO storage for topic messages (step 04)
- User identity from JWT context
- REST and WebSocket coexist on same topic

## What to do next

1. Add WebSocket upgrade route in Hono worker (GET `/topics/:id/ws`)
2. Implement WebSocket handling in Durable Object class
3. Add in-memory client tracking (connections map in DO)
4. Implement broadcast logic when new messages arrive
5. Test with two browser tabs on same topic
