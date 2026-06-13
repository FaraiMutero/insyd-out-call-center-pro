CREATE TABLE IF NOT EXISTS transcripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL UNIQUE REFERENCES recordings(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mock',
  language TEXT NOT NULL DEFAULT 'en',
  full_text TEXT NOT NULL DEFAULT '',
  segments_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transcripts_recording_id ON transcripts(recording_id);
