# CLAUDE.md — Step 05: Durable Objects + WebSocket

## What this step adds

- WebSocket upgrade handler in the Worker
- DO accepts WebSocket connections from clients
- DO holds connected clients in memory
- New messages trigger broadcasts to all connected clients
- Read cursors or last-seen tracking per user (optional, depending on scope)

## What is explicitly NOT in this step

- File attachments or R2 uploads
- Advanced features like message reactions via WebSocket
- Rate limiting on messages
- Message history over WebSocket (history endpoint stays REST)
- Reconnection or backoff logic (client responsibility)

## Done condition

1. GET `/topics/:id/ws` upgrades to WebSocket
2. Multiple browser tabs on the same topic see each other's messages in real-time
3. New messages posted via REST are broadcasted to WebSocket clients
4. Disconnected clients are cleaned up from memory
5. Messages are not lost if a client disconnects mid-stream

## Key decisions locked in (from previous steps)

- DO storage for topic messages (step 04)
- User identity from JWT
- REST and WebSocket coexist on the same topic

## What to do next

1. Add WebSocket upgrade handler in the Worker
2. Implement WebSocket support in the Durable Object class
3. Add in-memory client tracking (Map of connections)
4. Implement broadcast logic when new messages arrive
5. Test with two browser tabs simultaneously
