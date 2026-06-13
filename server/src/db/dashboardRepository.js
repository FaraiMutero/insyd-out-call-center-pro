import { db } from "./connection.js";

/* ── Org-level stats ────────────────────────────────────────────────── */

export function getOrgStats() {
  const counts = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'uploaded'                THEN 1 ELSE 0 END) AS uploading,
      SUM(CASE WHEN status = 'converting'              THEN 1 ELSE 0 END) AS converting,
      SUM(CASE WHEN status = 'ready_for_transcription' THEN 1 ELSE 0 END) AS ready,
      SUM(CASE WHEN status = 'transcribing'            THEN 1 ELSE 0 END) AS transcribing,
      SUM(CASE WHEN status = 'analyzing'               THEN 1 ELSE 0 END) AS analyzing,
      SUM(CASE WHEN status = 'complete'                THEN 1 ELSE 0 END) AS complete,
      SUM(CASE WHEN status = 'failed'                  THEN 1 ELSE 0 END) AS failed
    FROM recordings WHERE deleted_at IS NULL
  `).get();

  const analysis = db.prepare(`
    SELECT
      ROUND(AVG(ca.overall_score), 1)  AS avg_score,
      COUNT(ca.id)                     AS analysed_count,
      SUM(CASE WHEN ca.sentiment = 'positive' THEN 1 ELSE 0 END) AS positive,
      SUM(CASE WHEN ca.sentiment = 'negative' THEN 1 ELSE 0 END) AS negative,
      SUM(CASE WHEN ca.sentiment = 'neutral'  THEN 1 ELSE 0 END) AS neutral,
      SUM(CASE WHEN ca.sentiment = 'mixed'    THEN 1 ELSE 0 END) AS mixed
    FROM call_analyses ca
    JOIN recordings r ON r.id = ca.recording_id
    WHERE r.deleted_at IS NULL
  `).get();

  // Score distribution buckets: 0-49, 50-69, 70-84, 85-100
  const buckets = db.prepare(`
    SELECT
      SUM(CASE WHEN ca.overall_score < 50              THEN 1 ELSE 0 END) AS poor,
      SUM(CASE WHEN ca.overall_score >= 50 AND ca.overall_score < 70 THEN 1 ELSE 0 END) AS fair,
      SUM(CASE WHEN ca.overall_score >= 70 AND ca.overall_score < 85 THEN 1 ELSE 0 END) AS good,
      SUM(CASE WHEN ca.overall_score >= 85              THEN 1 ELSE 0 END) AS great
    FROM call_analyses ca
    JOIN recordings r ON r.id = ca.recording_id
    WHERE r.deleted_at IS NULL
  `).get();

  return { ...counts, ...analysis, scoreBuckets: buckets };
}

/* ── Agent leaderboard ───────────────────────────────────────────────── */

export function getAgentLeaderboard() {
  return db.prepare(`
    SELECT
      r.agent_name                               AS agentName,
      COUNT(r.id)                                AS callCount,
      ROUND(AVG(ca.overall_score), 1)            AS avgScore,
      MAX(ca.overall_score)                      AS bestScore,
      MIN(ca.overall_score)                      AS worstScore,
      SUM(CASE WHEN ca.sentiment = 'positive' THEN 1 ELSE 0 END) AS positiveCount,
      SUM(CASE WHEN ca.sentiment = 'negative' THEN 1 ELSE 0 END) AS negativeCount,
      SUM(CASE WHEN ca.outcome = 'sale_made'  THEN 1 ELSE 0 END) AS salesMade,
      MAX(r.call_datetime)                       AS lastCallAt
    FROM recordings r
    JOIN call_analyses ca ON ca.recording_id = r.id
    WHERE r.deleted_at IS NULL AND r.agent_name IS NOT NULL
    GROUP BY r.agent_name
    ORDER BY avgScore DESC
  `).all();
}

/* ── Per-agent detail ────────────────────────────────────────────────── */

export function getAgentDetail(agentName) {
  // Recent calls with scores
  const calls = db.prepare(`
    SELECT
      r.id, r.original_filename, r.call_datetime, r.direction, r.duration_sec,
      ca.overall_score, ca.sentiment, ca.outcome, ca.criteria_scores_json
    FROM recordings r
    JOIN call_analyses ca ON ca.recording_id = r.id
    WHERE r.deleted_at IS NULL AND r.agent_name = ?
    ORDER BY r.call_datetime DESC, r.id DESC
    LIMIT 20
  `).all(agentName);

  // Aggregate per-criterion averages across this agent's calls
  const criteriaAgg = {};
  for (const call of calls) {
    const scores = JSON.parse(call.criteria_scores_json || "[]");
    for (const s of scores) {
      if (!criteriaAgg[s.criterionId]) {
        criteriaAgg[s.criterionId] = { criterionId: s.criterionId, name: s.name, maxScore: s.maxScore, total: 0, count: 0 };
      }
      criteriaAgg[s.criterionId].total += s.score;
      criteriaAgg[s.criterionId].count += 1;
    }
  }
  const criteriaAvg = Object.values(criteriaAgg).map(c => ({
    ...c,
    avgScore: c.count ? +(c.total / c.count).toFixed(1) : 0,
    avgPct:   c.count ? +((c.total / c.count / c.maxScore) * 100).toFixed(0) : 0,
  })).sort((a, b) => a.avgPct - b.avgPct); // worst first → coaching focus

  const mappedCalls = calls.map(c => ({
    id: c.id,
    filename: c.original_filename,
    callDatetime: c.call_datetime,
    direction: c.direction,
    durationSec: c.duration_sec,
    overallScore: c.overall_score,
    sentiment: c.sentiment,
    outcome: c.outcome,
  }));

  const scores = mappedCalls.map(c => c.overallScore).filter(s => s != null);
  const summary = {
    callCount: mappedCalls.length,
    avgScore: scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null,
    bestScore: scores.length ? Math.max(...scores) : null,
    worstScore: scores.length ? Math.min(...scores) : null,
    lastCallAt: mappedCalls[0]?.callDatetime ?? null,
  };

  return {
    recentCalls: mappedCalls,
    criteriaStats: criteriaAvg,
    ...summary,
  };
}

/* ── Tip of the Day ──────────────────────────────────────────────────── */

export function getTipOfDay() {
  // Find the criterion with the lowest avg score across all agents in the last 7 days
  const rows = db.prepare(`
    SELECT ca.criteria_scores_json
    FROM call_analyses ca
    JOIN recordings r ON r.id = ca.recording_id
    WHERE r.deleted_at IS NULL
      AND r.created_at >= datetime('now', '-7 days')
    LIMIT 50
  `).all();

  const agg = {};
  for (const row of rows) {
    for (const s of JSON.parse(row.criteria_scores_json || "[]")) {
      if (!agg[s.criterionId]) agg[s.criterionId] = { criterionId: s.criterionId, name: s.name, maxScore: s.maxScore, total: 0, count: 0 };
      agg[s.criterionId].total += s.score;
      agg[s.criterionId].count += 1;
    }
  }
  if (!Object.keys(agg).length) return null;

  const worst = Object.values(agg)
    .map(c => ({ ...c, pct: c.count ? (c.total / c.count / c.maxScore) * 100 : 100 }))
    .sort((a, b) => a.pct - b.pct)[0];

  const TIPS = {
    opening:      "Start every call with your name, company, and a quick permission check — customers who know who they're talking to engage 2× longer.",
    compliance:   "Deliver your required disclosures in a confident, conversational tone, not a robotic recitation. Practise it until it feels natural.",
    discovery:    "Ask one open question, then stay silent for at least 4 seconds. Most agents jump in too early and miss the customer's real pain.",
    positioning:  "Tie every feature to the specific need the customer just told you about. 'You mentioned X — this is exactly how we solve that.'",
    objection:    "Acknowledge the objection fully before responding: 'That makes complete sense.' Then reframe, never dismiss.",
    price:        "Introduce price after you've established value. Anchor to the customer's current spend or loss before revealing your number.",
    closing:      "Use assumptive language: 'Let me get that set up for you' not 'Would you like to go ahead?' Confidence closes.",
    next_step:    "Confirm the next step with a specific date and time before hanging up. Vague follow-ups rarely happen.",
    talk_ratio:   "Record yourself and count: if you spoke more than 55% of the time, you're pitching not discovering. Listen more.",
    professionalism: "Eliminate filler words (um, like, basically). Record a 2-minute practice call daily for a week — improvement is rapid.",
  };

  return {
    criterion: worst.name,
    criterionId: worst.criterionId,
    avgPct: Math.round(worst.pct),
    tip: TIPS[worst.criterionId] || `Focus on improving your ${worst.name} score — it's the team's weakest area this week.`,
  };
}
