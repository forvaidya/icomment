-- Refactor to use email as user ID (primary key)
-- Step 05: Simplify user identification

-- Drop dependent tables (in reverse dependency order)
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS general_messages;
DROP TABLE IF EXISTS topics;
DROP TABLE IF EXISTS boards;
DROP TABLE IF EXISTS users;

-- Recreate users with email as PK
CREATE TABLE users (
  email TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  bio TEXT,
  profile_image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Recreate boards
CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(email)
);

-- Recreate topics
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

-- Recreate general_messages
CREATE TABLE general_messages (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id),
  FOREIGN KEY (user_id) REFERENCES users(email)
);

-- Recreate comments
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (topic_id) REFERENCES topics(id),
  FOREIGN KEY (user_id) REFERENCES users(email)
);

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
