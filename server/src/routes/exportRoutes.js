import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listRecordings, getRecordingById } from "../db/recordingsRepository.js";
import { getTranscriptByRecordingId } from "../db/transcriptRepository.js";
import { getCallAnalysisByRecordingId } from "../db/analysisRepository.js";

export const exportRoutes = Router();

exportRoutes.use(requireAuth, requireRole(["admin", "manager", "qa"]));

function esc(v) {
  if (v == null) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function toCSV(headers, rows) {
  return [headers.join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
}

/**
 * @openapi
 * /export/recordings.csv:
 *   get:
 *     tags: [Export]
 *     summary: Export all recordings as CSV (admin, manager, qa)
 *     description: Access token may be passed as `?token=` for direct browser download links.
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema: { type: string }
 */
/* GET /api/export/recordings.csv */
exportRoutes.get("/recordings.csv", (_req, res) => {
  const recordings = listRecordings({ limit: 1000 });

  const headers = [
    "id", "filename", "agent", "direction", "call_datetime", "status",
    "duration_sec", "qa_score", "sentiment", "outcome", "is_seed",
  ];

  const rows = recordings.map(r => {
    const analysis = getCallAnalysisByRecordingId(r.id);
    return [
      r.id, r.originalFilename, r.agentName || "", r.direction || "",
      r.callDatetime || "", r.status, r.durationSec || "",
      analysis?.overallScore ?? "", analysis?.sentiment ?? "", analysis?.outcome ?? "",
      r.isSeed ? "1" : "0",
    ];
  });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="recordings.csv"');
  res.send(toCSV(headers, rows));
});

/**
 * @openapi
 * /export/calls/{id}/report.csv:
 *   get:
 *     tags: [Export]
 *     summary: Export a single call report as CSV (admin, manager, qa)
 *     description: Includes summary, criteria scores, strengths/improvements/errors and transcript segments. Access token may be passed as `?token=`.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Recording id
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema: { type: string }
 *       404: { description: Recording not found, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
/* GET /api/export/calls/:id/report.csv */
exportRoutes.get("/calls/:id/report.csv", (req, res) => {
  const recordingId = Number(req.params.id);
  const recording = getRecordingById(recordingId);
  if (!recording) return res.status(404).json({ error: "NOT_FOUND" });

  const analysis = getCallAnalysisByRecordingId(recordingId);
  const transcript = getTranscriptByRecordingId(recordingId);

  const lines = [];

  // Summary section
  lines.push(["field", "value"]);
  lines.push(["filename", recording.originalFilename]);
  lines.push(["agent", recording.agentName || ""]);
  lines.push(["direction", recording.direction || ""]);
  lines.push(["call_datetime", recording.callDatetime || ""]);
  lines.push(["duration_sec", recording.durationSec || ""]);
  lines.push(["status", recording.status]);
  lines.push(["qa_score", analysis?.overallScore ?? ""]);
  lines.push(["sentiment", analysis?.sentiment ?? ""]);
  lines.push(["outcome", analysis?.outcome ?? ""]);
  lines.push([]);

  // Criteria section
  if (analysis?.criteriaScores?.length) {
    lines.push(["criterion", "score", "max_score", "pct"]);
    for (const c of analysis.criteriaScores) {
      lines.push([c.name, c.score, c.maxScore, c.pct]);
    }
    lines.push([]);
  }

  // Strengths / improvements / errors
  if (analysis?.strengths?.length) {
    lines.push(["type", "finding"]);
    for (const s of analysis.strengths)    lines.push(["strength",    s]);
    for (const s of analysis.improvements) lines.push(["improvement", s]);
    for (const s of analysis.errors)       lines.push(["error",       s]);
    lines.push([]);
  }

  // Transcript
  if (transcript?.segments?.length) {
    lines.push(["speaker", "start", "end", "text"]);
    for (const seg of transcript.segments) {
      lines.push([seg.speaker, seg.start, seg.end, seg.text]);
    }
  }

  const csv = lines.map(row => row.map(esc).join(",")).join("\n");
  const safeName = (recording.originalFilename || `recording-${recordingId}`).replace(/[^a-z0-9-_]/gi, "_");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}-report.csv"`);
  res.send(csv);
});
