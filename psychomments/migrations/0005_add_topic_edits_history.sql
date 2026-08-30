-- Topic edits history for tracking renames
-- Step 05: Topic rename/edit tracking

CREATE TABLE IF NOT EXISTS topic_edits (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  old_title TEXT,
  new_title TEXT,
  old_description TEXT,
  new_description TEXT,
  edited_by TEXT NOT NULL,
  edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (topic_id) REFERENCES topics(id),
  FOREIGN KEY (edited_by) REFERENCES users(email)
);

-- Index for quick history lookup
CREATE INDEX IF NOT EXISTS idx_topic_edits_topic_id ON topic_edits(topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_edits_edited_at ON topic_edits(edited_at);
