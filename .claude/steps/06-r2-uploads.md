# CLAUDE.md — Step 06: R2 Uploads

## What this step adds

- Presigned URL endpoint to mint time-limited R2 upload tokens
- Browser uploads files directly to R2 (Worker never handles bytes)
- Proxy endpoint to serve files back from R2
- Attachment keys stored in DO messages (topic context)
- Object key format: `attachments/{topicId}/{userId}/{uuid}`

## What is explicitly NOT in this step

- Avatar uploads (out of scope for now, but same pattern applies)
- Virus scanning or file type validation (assumed client-side or trust-based)
- Bandwidth optimization or CDN caching (R2 handles this)
- Signed URLs for read access (public R2 objects or proxy endpoint)
- Complex permissions model

## Done condition

1. POST `/upload-url` returns a presigned R2 URL valid for 15 minutes
2. Browser PUT file directly to the returned URL (not through Worker)
3. Worker's proxy endpoint GET `/files/:key` retrieves and serves the file
4. Message payload includes attachment key alongside text content
5. Attachment key is visible in topic message history

## Key decisions locked in (from previous steps)

- R2 bucket used for binary blobs
- Workers as proxy for serving files
- User identity and topic ID part of the storage key
- REST and WebSocket both support attachments

## What to do next

1. Create or bind an R2 bucket in wrangler.toml
2. Add presigned URL endpoint and implementation
3. Add proxy endpoint for file retrieval
4. Update message schema to include optional attachment key
5. Test upload and retrieval flow end-to-end
