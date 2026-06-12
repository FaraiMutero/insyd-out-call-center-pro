CREATE TABLE IF NOT EXISTS recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uploaded_by INTEGER NOT NULL,
  original_filename TEXT NOT NULL,
  agent_name TEXT,
  direction TEXT CHECK(direction IN ('inbound','outbound')),
  call_datetime TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  error TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(uploaded_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status);
CREATE INDEX IF NOT EXISTS idx_recordings_uploaded_by ON recordings(uploaded_by);
