-- Add default board for topics
-- Step 05: Create default board

-- Ensure system user exists
INSERT OR IGNORE INTO users (email)
VALUES ('system@psychomments.local');

-- Create default board
INSERT OR IGNORE INTO boards (id, name, description, created_by, created_at)
VALUES (
  'general',
  'General Discussion',
  'Default board for all topics',
  'system@psychomments.local',
  CURRENT_TIMESTAMP
);
