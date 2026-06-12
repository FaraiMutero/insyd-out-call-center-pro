import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createRecording, getRecordingById, listRecordings, updateRecordingStatus } from "../db/recordingsRepository.js";
import { uploadSingleAudio } from "../middleware/upload.js";
import { importRecordingFromExternalPath } from "../services/recordingIngestion.js";

export const recordingRoutes = Router();

recordingRoutes.use(requireAuth, requireRole(["admin", "manager", "qa"]));

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

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store");
  return fs.createReadStream(resolvedPath).pipe(res);
});

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
