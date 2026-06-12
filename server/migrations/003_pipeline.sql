CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  run_after TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_run_after ON jobs(status, run_after);

ALTER TABLE recordings ADD COLUMN original_path TEXT;
ALTER TABLE recordings ADD COLUMN stored_path TEXT;
ALTER TABLE recordings ADD COLUMN format TEXT;
ALTER TABLE recordings ADD COLUMN duration_sec REAL;
ALTER TABLE recordings ADD COLUMN size_bytes INTEGER;
ALTER TABLE recordings ADD COLUMN content_hash TEXT;
