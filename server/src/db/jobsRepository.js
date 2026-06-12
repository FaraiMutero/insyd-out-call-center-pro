import { db } from "./connection.js";

export function enqueueJob({ type, payload, runAfter = null }) {
  const result = db.prepare(
    `INSERT INTO jobs (type, payload_json, status, run_after)
     VALUES (?, ?, 'pending', COALESCE(?, datetime('now')))`
  ).run(type, JSON.stringify(payload), runAfter);

  return getJobById(result.lastInsertRowid);
}

export function getJobById(id) {
  return db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
}

export function claimNextPendingJob() {
  const candidate = db
    .prepare(
      `SELECT * FROM jobs
       WHERE status = 'pending' AND run_after <= datetime('now')
       ORDER BY created_at ASC, id ASC
       LIMIT 1`
    )
    .get();

  if (!candidate) {
    return null;
  }

  const updated = db
    .prepare(
      `UPDATE jobs
       SET status = 'running', attempts = attempts + 1, updated_at = datetime('now')
       WHERE id = ? AND status = 'pending'`
    )
    .run(candidate.id);

  if (updated.changes !== 1) {
    return null;
  }

  return getJobById(candidate.id);
}

export function completeJob(id) {
  db.prepare(
    "UPDATE jobs SET status = 'completed', updated_at = datetime('now') WHERE id = ?"
  ).run(id);
}

export function failJob(id, errorMessage) {
  db.prepare(
    "UPDATE jobs SET status = 'failed', last_error = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(errorMessage, id);
}
