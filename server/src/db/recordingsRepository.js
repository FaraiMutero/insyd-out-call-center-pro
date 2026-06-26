import { db } from "./connection.js";
import { toRelativeDataPath, toAbsoluteDataPath } from "../config/paths.js";

export function createRecording({
  uploadedBy,
  originalFilename,
  agentName = null,
  direction = null,
  callDatetime = null,
  status = "uploaded",
  originalPath = null,
  storedPath = null,
  format = null,
  durationSec = null,
  sizeBytes = null,
  contentHash = null
}) {
  const result = db
    .prepare(
      `INSERT INTO recordings
        (uploaded_by, original_filename, agent_name, direction, call_datetime, status,
         original_path, stored_path, format, duration_sec, size_bytes, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      uploadedBy,
      originalFilename,
      agentName,
      direction,
      callDatetime,
      status,
      toRelativeDataPath(originalPath),
      toRelativeDataPath(storedPath),
      format,
      durationSec,
      sizeBytes,
      contentHash
    );

  return getRecordingById(result.lastInsertRowid);
}

export function getRecordingById(id) {
  const row = db.prepare("SELECT * FROM recordings WHERE id = ?").get(id);
  return mapRecording(row);
}

export function listRecordings({ status = null, limit = 100, offset = 0 } = {}) {
  const where = ["deleted_at IS NULL"];
  const params = [];

  if (status) {
    where.push("status = ?");
    params.push(status);
  }

  params.push(limit, offset);

  return db
    .prepare(
      `SELECT * FROM recordings
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params)
    .map((row) => mapRecording(row));
}

export function updateRecordingStatus({ recordingId, status, error = null }) {
  db.prepare(
    `UPDATE recordings
     SET status = ?, error = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(status, error, recordingId);

  return getRecordingById(recordingId);
}

export function updateRecordingAssets({
  recordingId,
  storedPath = null,
  format = null,
  durationSec = null,
  sizeBytes = null,
  contentHash = null
}) {
  db.prepare(
    `UPDATE recordings
     SET stored_path = COALESCE(?, stored_path),
         format = COALESCE(?, format),
         duration_sec = COALESCE(?, duration_sec),
         size_bytes = COALESCE(?, size_bytes),
         content_hash = COALESCE(?, content_hash),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(toRelativeDataPath(storedPath), format, durationSec, sizeBytes, contentHash, recordingId);

  return getRecordingById(recordingId);
}

function mapRecording(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    uploadedBy: row.uploaded_by,
    originalFilename: row.original_filename,
    agentName: row.agent_name,
    direction: row.direction,
    callDatetime: row.call_datetime,
    status: row.status,
    error: row.error,
    originalPath: toAbsoluteDataPath(row.original_path),
    storedPath: toAbsoluteDataPath(row.stored_path),
    format: row.format,
    durationSec: row.duration_sec,
    sizeBytes: row.size_bytes,
    contentHash: row.content_hash,
    // seed provenance (migration 007)
    seedSource: row.seed_source || null,
    seedExternalId: row.seed_external_id || null,
    isSeed: row.is_seed === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || null,
  };
}

export function markRecordingDeleted(id) {
  db.prepare(
    "UPDATE recordings SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).run(id);
}

export function getRecordingByContentHash(hash) {
  const row = db.prepare("SELECT * FROM recordings WHERE content_hash = ? AND deleted_at IS NULL LIMIT 1").get(hash);
  return mapRecording(row);
}

export function renameAgentAcrossRecordings(oldName, newName) {
  const result = db
    .prepare(
      `UPDATE recordings SET agent_name = ?, updated_at = datetime('now')
       WHERE agent_name = ? AND deleted_at IS NULL`
    )
    .run(newName, oldName);
  return result.changes;
}
