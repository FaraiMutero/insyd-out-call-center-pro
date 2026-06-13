CREATE TABLE IF NOT EXISTS sops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  call_type TEXT NOT NULL DEFAULT 'outbound_sales',
  content TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rubrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sop_id INTEGER REFERENCES sops(id),
  title TEXT NOT NULL,
  call_type TEXT NOT NULL DEFAULT 'outbound_sales',
  criteria_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS call_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL UNIQUE REFERENCES recordings(id) ON DELETE CASCADE,
  rubric_id INTEGER NOT NULL REFERENCES rubrics(id),
  provider TEXT NOT NULL DEFAULT 'mock',
  overall_score REAL,
  criteria_scores_json TEXT NOT NULL DEFAULT '[]',
  sentiment TEXT CHECK(sentiment IN ('positive','neutral','negative','mixed')),
  outcome TEXT,
  strengths_json TEXT NOT NULL DEFAULT '[]',
  improvements_json TEXT NOT NULL DEFAULT '[]',
  errors_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT,
  raw_response TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_call_analyses_recording_id ON call_analyses(recording_id);
CREATE INDEX IF NOT EXISTS idx_call_analyses_rubric_id ON call_analyses(rubric_id);

CREATE TABLE IF NOT EXISTS coaching_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('strength','improvement','error')),
  content TEXT NOT NULL,
  recording_id INTEGER REFERENCES recordings(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_coaching_items_agent_name ON coaching_items(agent_name);
