import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getRecordingById } from "../db/recordingsRepository.js";
import { getTranscriptByRecordingId } from "../db/transcriptRepository.js";
import { getCallAnalysisByRecordingId, getCoachingItemsByAgent } from "../db/analysisRepository.js";
import { enqueueJob } from "../db/jobsRepository.js";
import { routeAsync } from "../utils/routeAsync.js";

export const callRoutes = Router();

callRoutes.use(requireAuth, requireRole(["admin", "manager", "qa"]));

/**
 * @openapi
 * /calls/{id}/report:
 *   get:
 *     tags: [Calls]
 *     summary: Full composite call report (recording + transcript + analysis + coaching)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Recording id
 *     responses:
 *       200:
 *         description: Composite report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recording: { $ref: '#/components/schemas/Recording' }
 *                 transcript: { type: object, nullable: true }
 *                 analysis: { type: object, nullable: true }
 *                 coaching: { type: array, items: { type: object } }
 *       400: { description: Invalid recording id, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: Recording not found, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
/* GET /api/calls/:id/report — full call report composite */
callRoutes.get("/:id/report", routeAsync(async (req, res) => {
  const recordingId = Number(req.params.id);
  if (!Number.isFinite(recordingId)) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid recording id" });
  }

  const recording = getRecordingById(recordingId);
  if (!recording || recording.deletedAt) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Recording not found" });
  }

  const transcript = getTranscriptByRecordingId(recordingId);
  const analysis   = getCallAnalysisByRecordingId(recordingId);
  const coaching   = recording.agentName ? getCoachingItemsByAgent(recording.agentName) : [];

  res.json({
    recording,
    transcript: transcript || null,
    analysis:   analysis   || null,
    coaching,
  });
}));

/**
 * @openapi
 * /calls/{id}/reanalyze:
 *   post:
 *     tags: [Calls]
 *     summary: Re-queue the analysis job for a recording (admin, manager)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Recording id
 *     responses:
 *       200:
 *         description: Job queued
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { queued: { type: boolean } } }
 *       404: { description: Recording not found, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
/* POST /api/calls/:id/reanalyze — re-queue the analyze job */
callRoutes.post("/:id/reanalyze", requireRole(["admin", "manager"]), routeAsync(async (req, res) => {
  const recordingId = Number(req.params.id);
  const recording = getRecordingById(recordingId);
  if (!recording) return res.status(404).json({ error: "NOT_FOUND" });

  enqueueJob({ type: "analyze_recording", payload: { recordingId } });
  res.json({ queued: true });
}));
