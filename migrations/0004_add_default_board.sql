-- Add default board for topics
-- Step 05: Create default board

INSERT OR IGNORE INTO boards (id, name, description, created_by, created_at)
VALUES (
  'general',
  'General Discussion',
  'Default board for all topics',
  'system',
  CURRENT_TIMESTAMP
);

-- Ensure system user exists
INSERT OR IGNORE INTO users (id, email, created_at)
VALUES ('system', 'system@psychomments.local', CURRENT_TIMESTAMP);
