-- Add embedding column for vector similarity search
ALTER TABLE search_history ADD COLUMN embedding TEXT;

-- Index for query lookups (for similarity search filtering)
CREATE INDEX IF NOT EXISTS idx_query ON search_history(query);
