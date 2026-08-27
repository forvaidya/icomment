-- Add profile fields to users table
-- Step 04: User Profiles + R2

ALTER TABLE users ADD COLUMN username TEXT UNIQUE;
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN profile_image_url TEXT;

-- Index for username lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
