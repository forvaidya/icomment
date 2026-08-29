-- IoT messages table for device data persistence
-- Step 06: Schemaless JSON storage for IoT payloads

CREATE TABLE IF NOT EXISTS iot_messages (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  payload TEXT NOT NULL,  -- Raw JSON, any structure
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS idx_iot_messages_device_id ON iot_messages(device_id);
CREATE INDEX IF NOT EXISTS idx_iot_messages_timestamp ON iot_messages(timestamp);
