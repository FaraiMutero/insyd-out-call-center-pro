ALTER TABLE recordings ADD COLUMN seed_source TEXT;
ALTER TABLE recordings ADD COLUMN seed_external_id TEXT;
ALTER TABLE recordings ADD COLUMN is_seed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recordings ADD COLUMN seed_reference_transcript TEXT;

CREATE INDEX IF NOT EXISTS idx_recordings_is_seed ON recordings(is_seed);
