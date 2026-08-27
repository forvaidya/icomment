-- Migrate existing schema to use email as user ID
-- This creates new tables with correct schema and migrates data

-- Step 1: Rename old users to users_old
ALTER TABLE users RENAME TO users_old;

-- Step 2: Create new users table with email as PK
CREATE TABLE users (
  email TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  bio TEXT,
  profile_image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Step 3: Migrate data from old users to new
INSERT INTO users (email, username, bio, profile_image_url, created_at)
SELECT email, username, bio, profile_image_url, created_at FROM users_old;

-- Step 4: Drop old boards and recreate with new FK
DROP TABLE IF EXISTS boards;
CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(email)
);

-- Step 5: Drop old topics and recreate with new FK
DROP TABLE IF EXISTS topics;
CREATE TABLE topics (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id),
  FOREIGN KEY (created_by) REFERENCES users(email)
);

-- Step 6: Drop old messages and recreate with new FK
DROP TABLE IF EXISTS general_messages;
CREATE TABLE general_messages (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id),
  FOREIGN KEY (user_id) REFERENCES users(email)
);

-- Step 7: Update comments to reference new users table
DROP TABLE IF EXISTS comments;
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (topic_id) REFERENCES topics(id),
  FOREIGN KEY (user_id) REFERENCES users(email)
);

-- Step 8: Drop old users table
DROP TABLE IF EXISTS users_old;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_boards_created_by ON boards(created_by);
CREATE INDEX IF NOT EXISTS idx_topics_board_id ON topics(board_id);
CREATE INDEX IF NOT EXISTS idx_topics_created_by ON topics(created_by);
CREATE INDEX IF NOT EXISTS idx_messages_board_id ON general_messages(board_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON general_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON general_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_comments_topic_id ON comments(topic_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;
