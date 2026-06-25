import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createRecording, getRecordingById, listRecordings, markRecordingDeleted, updateRecordingStatus } from "../db/recordingsRepository.js";
import { uploadSingleAudio } from "../middleware/upload.js";
import { importRecordingFromExternalPath } from "../services/recordingIngestion.js";
import { writeAudit } from "../db/auditRepository.js";

export const recordingRoutes = Router();

recordingRoutes.use(requireAuth, requireRole(["admin", "manager", "qa"]));

/**
 * @openapi
 * /recordings:
 *   get:
 *     tags: [Recordings]
 *     summary: List recordings (admin, manager, qa)
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [uploaded, converting, ready_for_transcription, transcribing, analyzing, complete, failed] }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100, maximum: 200 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Recording list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recordings: { type: array, items: { $ref: '#/components/schemas/Recording' } }
 *                 limit: { type: integer }
 *                 offset: { type: integer }
 */
recordingRoutes.get("/", (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);
  const recordings = listRecordings({
    status: req.query.status || null,
    limit,
    offset
  });
  res.json({ recordings, limit, offset });
});

/**
 * @openapi
 * /recordings/{id}/stream:
 *   get:
 *     tags: [Recordings]
 *     summary: Stream the audio file for a recording
 *     description: Supports HTTP Range requests for seeking. Access token may be passed as `?token=` since `<audio>`/`<a>` elements can't set headers.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: header
 *         name: Range
 *         schema: { type: string, example: "bytes=0-1023" }
 *     responses:
 *       200: { description: Full audio file }
 *       206: { description: Partial content (range request) }
 *       400: { description: Invalid recording id, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: Recording or audio file not found, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       416: { description: Range not satisfiable }
 */
recordingRoutes.get("/:id/stream", (req, res) => {
  const recordingId = Number(req.params.id);
  if (!Number.isFinite(recordingId)) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "invalid recording id" });
  }

  const recording = getRecordingById(recordingId);
  if (!recording || !recording.storedPath) {
    return res.status(404).json({ error: "RECORDING_NOT_FOUND" });
  }

  const resolvedPath = path.resolve(recording.storedPath);
  if (!fs.existsSync(resolvedPath)) {
    return res.status(404).json({ error: "AUDIO_NOT_FOUND" });
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  const contentType = extension === ".wav" ? "audio/wav" : "audio/mpeg";
  const fileSize = fs.statSync(resolvedPath).size;

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Accept-Ranges", "bytes");

  const range = req.headers.range;
  if (!range) {
    res.setHeader("Content-Length", fileSize);
    return fs.createReadStream(resolvedPath).pipe(res);
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) {
    return res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
  }

  let start = match[1] ? Number(match[1]) : fileSize - Number(match[2]);
  let end = match[2] && match[1] ? Number(match[2]) : fileSize - 1;
  end = Math.min(end, fileSize - 1);

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0) {
    return res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
  }

  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
  res.setHeader("Content-Length", end - start + 1);
  return fs.createReadStream(resolvedPath, { start, end }).pipe(res);
});

/**
 * @openapi
 * /recordings/upload:
 *   post:
 *     tags: [Recordings]
 *     summary: Upload an audio file and queue it for the pipeline
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [audio]
 *             properties:
 *               audio: { type: string, format: binary }
 *               originalFilename: { type: string }
 *               agentName: { type: string }
 *               direction: { type: string, enum: [inbound, outbound] }
 *               callDatetime: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Recording created and queued
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { recording: { $ref: '#/components/schemas/Recording' } } }
 *       400: { description: Missing audio file, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
recordingRoutes.post("/upload", uploadSingleAudio, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "audio file is required" });
  }

  const { originalFilename, agentName, direction, callDatetime } = req.body || {};
  const effectiveFilename = originalFilename || req.file.originalname;

  const recording = importRecordingFromExternalPath({
    uploadedBy: req.user.id,
    sourcePath: req.file.path,
    originalFilename: effectiveFilename,
    agentName: agentName || null,
    direction: direction || null,
    callDatetime: callDatetime || null
  });

  res.status(201).json({ recording });
});

/**
 * @openapi
 * /recordings:
 *   post:
 *     tags: [Recordings]
 *     summary: Create a recording stub without uploading a file
 *     description: Used for seeding/demo data. Status is set to `uploaded`; no audio file is attached.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [originalFilename]
 *             properties:
 *               originalFilename: { type: string }
 *               agentName: { type: string }
 *               direction: { type: string, enum: [inbound, outbound] }
 *               callDatetime: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Recording created
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { recording: { $ref: '#/components/schemas/Recording' } } }
 *       400: { description: originalFilename is required, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
recordingRoutes.post("/", (req, res) => {
  const { originalFilename, agentName, direction, callDatetime } = req.body || {};
  if (!originalFilename) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "originalFilename is required" });
  }

  const recording = createRecording({
    uploadedBy: req.user.id,
    originalFilename,
    agentName: agentName || null,
    direction: direction || null,
    callDatetime: callDatetime || null,
    status: "uploaded"
  });

  res.status(201).json({ recording });
});

/**
 * @openapi
 * /recordings/{id}/status:
 *   patch:
 *     tags: [Recordings]
 *     summary: Manually set a recording's pipeline status
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [uploaded, converting, ready_for_transcription, transcribing, analyzing, complete, failed] }
 *               error: { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: Recording updated
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { recording: { $ref: '#/components/schemas/Recording' } } }
 *       400: { description: status is required, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: Recording not found, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
recordingRoutes.patch("/:id/status", (req, res) => {
  const recordingId = Number(req.params.id);
  const { status, error } = req.body || {};
  if (!status) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "status is required" });
  }

  const recording = updateRecordingStatus({
    recordingId,
    status,
    error: error || null
  });

  if (!recording) {
    return res.status(404).json({ error: "RECORDING_NOT_FOUND" });
  }

  res.json({ recording });
});

/**
 * @openapi
 * /recordings/{id}:
 *   delete:
 *     tags: [Recordings]
 *     summary: Soft-delete a recording (admin, manager)
 *     description: Sets `deleted_at` on the recording. It is excluded from listings and call reports, but the database row and audio file on disk are preserved.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Recording deleted
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { recording: { $ref: '#/components/schemas/Recording' } } }
 *       400: { description: Invalid recording id, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: Recording not found, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
recordingRoutes.delete("/:id", requireRole(["admin", "manager"]), (req, res) => {
  const recordingId = Number(req.params.id);
  if (!Number.isFinite(recordingId)) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "invalid recording id" });
  }

  const recording = getRecordingById(recordingId);
  if (!recording || recording.deletedAt) {
    return res.status(404).json({ error: "RECORDING_NOT_FOUND" });
  }

  markRecordingDeleted(recordingId);

  writeAudit({
    userId: req.user.id,
    action: "RECORDING_DELETED",
    entity: "recording",
    entityId: String(recordingId),
    detail: { originalFilename: recording.originalFilename }
  });

  res.json({ recording: getRecordingById(recordingId) });
});
