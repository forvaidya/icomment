# ThreadBoard — Project Idea

> **Purpose of this file:** High-level intent and architecture only.
> No code. No implementation detail. Pass this to Claude Code to generate
> per-step CLAUDE.md files for each milestone branch.


---

## What I am building

A topic-based message board running entirely on the Cloudflare Workers
ecosystem. The goal is **ecosystem learning**, not a production product.
UI exists only to drive and verify backend behaviour. Features and UX are
incidental.

Appname: psychomments


---

## Why I am building it

To understand the following Cloudflare primitives hands-on, in the right
order, with a real reason for each one to exist:

- Cloudflare Workers (compute)
- Cloudflare Access (auth gate)
- D1 (relational SQL at edge)
- Durable Objects (stateful compute + WebSocket)
- R2 (blob / object storage)

The following are explicitly **out of scope** for this project:

- Workers KV (no use case — D1 and DO cover consistency needs)
- Queues (no async background work)
- Hyperdrive (no external Postgres)
- Pages (no frontend framework, no build pipeline)
- Any external database or auth provider beyond CF Access

---

## Architecture

```
Browser / Tester
      │
      ▼
Cloudflare Access          ← identity gate, JWT issued on login
      │
      ▼
Worker (Hono router)       ← all requests enter here, JWT verified
      │
      ├──────────────────────────────────┐──────────────────────────┐
      ▼                                  ▼                          ▼
D1 (SQLite)                  Durable Object (per topic)            R2
users                        1 DO instance per topic         attachments/{topicId}/{userId}/{uuid}
boards                       messages stored in DO KV         avatars/{userId}
topics                       WebSocket fan-out to clients
general_messages             read cursors per user
reactions
```

### Data ownership rules

| Data | Owner | Reason |
|---|---|---|
| Users, boards, topics | D1 | Relational, needs joins and counts |
| General messages (global feed) | D1 | High read, no real-time requirement |
| Topic messages | Durable Object | Needs ordering, consistency, live push |
| File attachments | R2 | Binary blobs, not rows |
| Auth identity | CF Access JWT | No separate user store needed |

### Request flow

```
POST /topics/:id/messages
  Worker → verifies JWT → stubs to DO instance → DO stores + broadcasts

POST /upload-url
  Worker → verifies JWT → mints presigned R2 URL → returns { url, key }
  Browser → PUT file directly to R2 (Worker never touches bytes)

GET /topics/:id/ws
  Worker → upgrades to WebSocket → DO accepts and holds connection
```

---

## Milestones

Each milestone is a git branch. Each branch forks from the previous.
Each has a clear done-condition before moving on.

```
main
  └── step/01-worker-access
  └── step/02-d1-crud
  └── step/03-hono-router
  └── step/04-do-rest
  └── step/05-do-websocket
  └── step/06-r2-uploads
```

### Step 01 — Worker + CF Access
Stand up a bare Worker. Gate it behind a CF Access policy.
Verify JWT is present in the request. Print JWT claims in the response.
Ideally Access configurations should be done using wrangler and the placess where it cant be done like whitelist an email write the instructions and I will do it manually

**Done when:** deployed URL requires login, JWT claims are visible.


### Step 02 — D1 CRUD
Create D1 database. Apply schema (users, boards, topics, general_messages).
Expose raw fetch-handler endpoints — no router yet.
CRUD for general messages and boards only.
**Done when:** POST and GET general messages work via curl.

### Step 03 — Hono Router + JWT Middleware
Introduce Hono as the router. Move all D1 endpoints into Hono routes.
Add JWT verification middleware — all routes protected.
Extract user identity (sub, email) from JWT and attach to request context.
**Done when:** all routes go through Hono, unauthenticated requests rejected.

### Step 04 — Durable Objects (REST only)
Introduce DO class for topics. Route topic message POST and GET through DO.
Use DO storage API only — no WebSocket yet.
One DO instance per topic, keyed by topic id.
**Done when:** topic messages stored in DO, separate from D1, retrievable via REST.

### Step 05 — Durable Objects + WebSocket
Add WebSocket upgrade to the topic DO.
DO holds connected clients in memory, broadcasts on new message.
**Done when:** two browser tabs on the same topic see each other's messages live.

### Step 06 — R2 Uploads
Add presigned URL endpoint. Browser uploads directly to R2.
Worker serves files back via proxy endpoint.
Attachment key recorded in DO message or D1 general message.
**Done when:** image uploaded, key stored in message, retrievable via /files/:key.

---

## Branching and tagging discipline

```
# at end of each step
wrangler deploy          # must succeed cleanly
git tag milestone/0N-name
git checkout -b step/0N+1-name
```

Each tag is a permanent known-good state.
Each branch diff shows exactly what one step added.

---

## Instructions for Claude Code

When this file is passed to Claude Code, generate a `CLAUDE.md` for each
milestone step above. Each `CLAUDE.md` should live at the repo root when
that branch is checked out and must contain:

- What this step adds (and only this step)
- What is explicitly not in scope for this step
- The done-condition
- Key decisions already locked (carry forward from previous steps)
- What to do next (the first concrete action)

Do not generate any code. Do not implement anything.
Generate only the `CLAUDE.md` content for each step, clearly labelled.