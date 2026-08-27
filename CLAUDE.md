# CLAUDE.md — Step 04: User Profiles + R2

## What this step adds

- **D1 schema expansion**: Users table now includes profile fields
  - `username` (unique, TEXT)
  - `bio` (nullable, TEXT)
  - `profile_image_url` (nullable, TEXT, stores R2 URL)
- **R2 bucket** for storing profile images
  - Binding: `R2_PROFILES` (Hungarian notation: `R2_` prefix)
  - Bucket ID: `psychomments-profiles` (kebab-case, project-scoped)
- **Profile CRUD endpoints**:
  - `GET /users/:id` — fetch user profile
  - `POST /users` — create new user
  - `PUT /users/:id` — update profile (username, bio)
  - `POST /users/:id/avatar` — upload profile image to R2, update URL in D1
- **Image upload flow**:
  - Client uploads image to `POST /users/:id/avatar`
  - Worker validates (size, format)
  - Stores in R2 under `users/{userId}/{filename}`
  - Saves public R2 URL in D1 `users.profile_image_url`
  - Returns JSON with updated URL

## What is explicitly NOT in this step

- User authentication/signup (CF Access provides gate, JWT extraction done)
- Image resizing/optimization (store as-is)
- Rate limiting on uploads
- Durable Objects (still deferred to Step 05)
- WebSocket (still deferred to Step 05)
- Comments/reactions (still deferred)

## Done condition

- `GET /users/:id` returns full profile (id, email, username, bio, profile_image_url)
- `POST /users` creates new user with profile fields
- `PUT /users/:id` updates username/bio
- `POST /users/:id/avatar` uploads image to R2, updates D1 URL
- All endpoints tested via curl with sample data
- Avatar URLs are public R2 URLs (readable from browser)

## Key decisions locked in

- R2 for profile images (cheap, globally distributed, worker-integrated)
- URLs stored in D1 (denormalized for fast profile retrieval)
- Public R2 URLs (no signed requests needed for viewing)
- Simple file naming: `users/{userId}/{timestamp}-{filename}`
- Image validation: size < 5MB, format (jpg, png, webp)

## Architecture Patterns

### R2 Bucket Structure
```
psychomments-profiles/
  users/
    {userId}/
      {timestamp}-{filename}.jpg
```

### Profile Data Model (D1)
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,          -- NEW
  bio TEXT,                       -- NEW
  profile_image_url TEXT,         -- NEW (R2 URL)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Avatar Upload Flow
1. Client sends `multipart/form-data` with image file
2. Worker validates (size, MIME type)
3. Generate unique filename: `{timestamp}-{originalName}`
4. Upload to R2: `users/{userId}/{filename}`
5. Get public R2 URL
6. Update `users.profile_image_url` in D1
7. Return JSON: `{ id, email, username, bio, profile_image_url }`

## Service Selection Review
- **D1**: User profiles (relational, queried per-request) ✅
- **R2**: Images (static, global distribution, cheap bandwidth) ✅
- **KV**: Admin list (config, read-heavy) ✅ (from Step 02)

## What to do next

1. Create R2 bucket (psychomments-profiles)
2. Migrate D1 schema (add username, bio, profile_image_url columns)
3. Add profile endpoints (GET, POST, PUT /users/:id)
4. Add avatar upload endpoint (POST /users/:id/avatar)
5. Test all endpoints with curl + image uploads
6. Deploy and verify avatar URLs work in browser
7. Then move to Step 05: Durable Objects for topic-scoped messaging
