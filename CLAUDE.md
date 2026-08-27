# CLAUDE.md — Step 02: D1 CRUD

## What this step adds

- D1 database with schema: `users`, `boards`, `topics`, `general_messages`
- Raw fetch-handler endpoints for D1 operations (no router yet)
- CRUD for `general_messages` and `boards` only
- **KV-based admin role system**:
  - Binding: `KV_ADMIN` (Hungarian notation: `KV_` prefix identifies as KV namespace)
  - Namespace ID: `psychomments-admin` (project-scoped kebab-case)
  - Admin list: `["forvaidya@gmail.com"]` (stored as JSON array)
  - User role detection: Extract email from JWT, check KV membership
  - Personalized welcome: "Admin: <email>" or "Patron: <email>"

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

## Architecture & Naming Conventions

### Service Selection (D1 vs KV)
- **D1**: Relational data accessed by multiple workers (users, boards, topics, general_messages)
- **KV**: Small config/reference data, read-heavy, no complex queries (admin list)

### Binding Naming (Hungarian Notation)
- Format: `<TYPE>_<PURPOSE>`
- Examples: `DB`, `KV_ADMIN`
- Rationale: Type prefix immediately identifies resource kind at a glance (legacy C convention)

### Namespace ID Naming (kebab-case)
- Format: `<project>-<purpose>`
- Examples: `psychomments-admin`
- Rationale: Resource IDs follow lowercase kebab-case (URI-like)

### Binding ↔ ID Tuple
- Each binding has exactly one namespace ID (1:1 pairing)
- Multiple KV namespaces possible, each with its own binding+id tuple
- Example: `KV_ADMIN` binding ↔ `psychomments-admin` ID

## What to do next

1. Deploy and test personalized welcome page
2. Verify admin role detection works via JWT
3. Then move to Step 03: Hono Router refactoring
