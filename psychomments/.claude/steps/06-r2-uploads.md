# CLAUDE.md — Step 06: R2 Uploads

## What this step adds

- Presigned URL endpoint (POST `/upload-url`)
- Browser uploads directly to R2 (Worker never touches bytes)
- Proxy endpoint to serve files (GET `/files/:key`)
- Attachment key stored in DO topic messages or D1 general messages
- Object key format: `attachments/{topicId}/{userId}/{uuid}`

## What is explicitly NOT in this step

- Avatar uploads
- Virus scanning or file validation
- Bandwidth optimization or CDN setup
- Complex access control or permissions
- Signed URLs for direct read access

## Done condition

- POST `/upload-url` returns presigned R2 URL
- Browser uploads directly to R2 (verified)
- GET `/files/:key` proxy endpoint retrieves and serves file
- Attachment key stored in message payload
- Full upload-store-retrieve cycle works end-to-end

## Key decisions locked in (from previous steps)

- WebSocket and REST messaging from steps 04-05
- R2 bucket for binary blobs
- Worker as proxy for file serving
- User identity and topic ID as part of storage key

## What to do next

1. Create and bind R2 bucket in wrangler.toml
2. Implement presigned URL generation (POST `/upload-url`)
3. Implement file proxy endpoint (GET `/files/:key`)
4. Update topic message schema to include optional attachment key
5. Test full upload-store-retrieve flow
