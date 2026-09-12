-- Create search_history table
CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  query TEXT NOT NULL,
  diet TEXT,
  allergies TEXT,
  recipeTitle TEXT,
  liked INTEGER,
  timestamp INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_userId ON search_history(userId);
CREATE INDEX IF NOT EXISTS idx_timestamp ON search_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_userId_timestamp ON search_history(userId, timestamp DESC);
