import { db } from "./connection.js";

/* ── Rubrics ─────────────────────────────────────────────────────────── */

export function createRubric({ sopId = null, title, callType = "outbound_sales", criteria, createdBy = null }) {
  const result = db.prepare(
    `INSERT INTO rubrics (sop_id, title, call_type, criteria_json, is_active, created_by)
     VALUES (?, ?, ?, ?, 1, ?)`
  ).run(sopId, title, callType, JSON.stringify(criteria), createdBy);

  // Deactivate any other active rubric for the same call_type
  db.prepare(
    `UPDATE rubrics SET is_active = 0
     WHERE call_type = ? AND id != ?`
  ).run(callType, result.lastInsertRowid);

  return getRubricById(result.lastInsertRowid);
}

export function getActiveRubric(callType = "outbound_sales") {
  const row = db.prepare(
    "SELECT * FROM rubrics WHERE call_type = ? AND is_active = 1 ORDER BY id DESC LIMIT 1"
  ).get(callType);
  return mapRubric(row);
}

export function getRubricById(id) {
  const row = db.prepare("SELECT * FROM rubrics WHERE id = ?").get(id);
  return mapRubric(row);
}

export function hasAnyRubric() {
  return db.prepare("SELECT 1 FROM rubrics LIMIT 1").get() != null;
}

export function listRubrics() {
  return db.prepare("SELECT * FROM rubrics ORDER BY id DESC").all().map(mapRubric);
}

export function updateRubricCriteria(id, criteria) {
  const total = criteria.reduce((s, c) => s + (c.weight || 0), 0);
  if (Math.round(total) !== 100) {
    throw new Error(`Criteria weights must sum to 100 (got ${total})`);
  }
  db.prepare(
    "UPDATE rubrics SET criteria_json = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(criteria), id);
  return getRubricById(id);
}

/* ── Call analyses ───────────────────────────────────────────────────── */

export function upsertCallAnalysis({
  recordingId, rubricId, provider,
  overallScore, criteriaScores, sentiment, outcome,
  strengths, improvements, errors, summary, rawResponse = null,
}) {
  db.prepare(
    `INSERT INTO call_analyses
       (recording_id, rubric_id, provider, overall_score, criteria_scores_json,
        sentiment, outcome, strengths_json, improvements_json, errors_json,
        summary, raw_response, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(recording_id) DO UPDATE SET
       rubric_id            = excluded.rubric_id,
       provider             = excluded.provider,
       overall_score        = excluded.overall_score,
       criteria_scores_json = excluded.criteria_scores_json,
       sentiment            = excluded.sentiment,
       outcome              = excluded.outcome,
       strengths_json       = excluded.strengths_json,
       improvements_json    = excluded.improvements_json,
       errors_json          = excluded.errors_json,
       summary              = excluded.summary,
       raw_response         = excluded.raw_response,
       updated_at           = datetime('now')`
  ).run(
    recordingId, rubricId, provider,
    overallScore, JSON.stringify(criteriaScores || []),
    sentiment, outcome,
    JSON.stringify(strengths || []),
    JSON.stringify(improvements || []),
    JSON.stringify(errors || []),
    summary, rawResponse
  );

  return getCallAnalysisByRecordingId(recordingId);
}

export function getCallAnalysisByRecordingId(recordingId) {
  const row = db.prepare("SELECT * FROM call_analyses WHERE recording_id = ?").get(recordingId);
  return mapAnalysis(row);
}

/* ── Coaching items ──────────────────────────────────────────────────── */

export function replaceCoachingItemsForAgent(agentName, items) {
  db.prepare("DELETE FROM coaching_items WHERE agent_name = ?").run(agentName);
  const stmt = db.prepare(
    "INSERT INTO coaching_items (agent_name, type, content, recording_id) VALUES (?, ?, ?, ?)"
  );
  for (const item of items) {
    stmt.run(agentName, item.type, item.content, item.recordingId || null);
  }
}

export function getCoachingItemsByAgent(agentName) {
  return db.prepare(
    "SELECT * FROM coaching_items WHERE agent_name = ? ORDER BY created_at DESC"
  ).all(agentName);
}

/* ── Mappers ─────────────────────────────────────────────────────────── */

function mapRubric(row) {
  if (!row) return null;
  return {
    id: row.id,
    sopId: row.sop_id,
    title: row.title,
    callType: row.call_type,
    criteria: JSON.parse(row.criteria_json || "[]"),
    isActive: row.is_active === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAnalysis(row) {
  if (!row) return null;
  return {
    id: row.id,
    recordingId: row.recording_id,
    rubricId: row.rubric_id,
    provider: row.provider,
    overallScore: row.overall_score,
    criteriaScores: JSON.parse(row.criteria_scores_json || "[]"),
    sentiment: row.sentiment,
    outcome: row.outcome,
    strengths: JSON.parse(row.strengths_json || "[]"),
    improvements: JSON.parse(row.improvements_json || "[]"),
    errors: JSON.parse(row.errors_json || "[]"),
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
