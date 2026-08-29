-- Initial schema for psychomments
-- Step 02: D1 CRUD

CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  bio TEXT,
  profile_image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(email)
);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id),
  FOREIGN KEY (created_by) REFERENCES users(email)
);

CREATE TABLE IF NOT EXISTS general_messages (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id),
  FOREIGN KEY (user_id) REFERENCES users(email)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_boards_created_by ON boards(created_by);
CREATE INDEX IF NOT EXISTS idx_topics_board_id ON topics(board_id);
CREATE INDEX IF NOT EXISTS idx_topics_created_by ON topics(created_by);
CREATE INDEX IF NOT EXISTS idx_messages_board_id ON general_messages(board_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON general_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON general_messages(created_at);
