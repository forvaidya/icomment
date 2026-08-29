# Step-Specific CLAUDE.md Files

Each file in this directory contains the `CLAUDE.md` content for its corresponding milestone branch.

## How to use

When checking out to a step branch, copy the relevant file's content to the root `CLAUDE.md`:

```bash
# Example: checking out to step/01-worker-access
git checkout step/01-worker-access
cp .claude/steps/01-worker-access.md CLAUDE.md
git add CLAUDE.md && git commit -m "Add step-specific CLAUDE.md"
```

Or simply open the file as reference while working on that step.

## Files

- `01-worker-access.md` — Worker + CF Access gate + JWT verification
- `02-d1-crud.md` — D1 database with boards and general messages CRUD
- `03-hono-router.md` — Refactor to Hono router + JWT middleware
- `04-do-rest.md` — Durable Objects for topic messages (REST only)
- `05-do-websocket.md` — WebSocket support in Durable Objects
- `06-r2-uploads.md` — Presigned URLs and file uploads to R2

Each file clearly states:
- What this step adds (and only this step)
- What is explicitly not in scope
- The done-condition
- Key decisions locked in from previous steps
- What to do next
