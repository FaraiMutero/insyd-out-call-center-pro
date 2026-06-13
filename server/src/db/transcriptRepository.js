import { db } from "./connection.js";

export function upsertTranscript({ recordingId, provider, language, fullText, segments }) {
  db.prepare(
    `INSERT INTO transcripts (recording_id, provider, language, full_text, segments_json, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(recording_id) DO UPDATE SET
       provider     = excluded.provider,
       language     = excluded.language,
       full_text    = excluded.full_text,
       segments_json = excluded.segments_json,
       updated_at   = datetime('now')`
  ).run(recordingId, provider, language || "en", fullText, JSON.stringify(segments || []));

  return getTranscriptByRecordingId(recordingId);
}

export function getTranscriptByRecordingId(recordingId) {
  const row = db.prepare("SELECT * FROM transcripts WHERE recording_id = ?").get(recordingId);
  return mapTranscript(row);
}

function mapTranscript(row) {
  if (!row) return null;
  return {
    id: row.id,
    recordingId: row.recording_id,
    provider: row.provider,
    language: row.language,
    fullText: row.full_text,
    segments: JSON.parse(row.segments_json || "[]"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
