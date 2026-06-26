import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolveFromRoot } from "../config/paths.js";
import { createRecording } from "../db/recordingsRepository.js";
import { enqueueRecordingConversion } from "./recordingPipeline.js";
import { persistUploadedFile } from "./recordingStorage.js";

function ensureFileExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("Source file not found for import");
  }
}

function stageExternalFileToTemp(sourcePath) {
  const tmpDir = resolveFromRoot("data", "tmp", "external-import");
  fs.mkdirSync(tmpDir, { recursive: true });

  const ext = path.extname(sourcePath) || ".bin";
  const tmpPath = path.join(tmpDir, `${crypto.randomUUID()}${ext.toLowerCase()}`);
  fs.copyFileSync(sourcePath, tmpPath);
  return tmpPath;
}

export function importRecordingFromExternalPath({
  uploadedBy,
  sourcePath,
  originalFilename,
  agentName = null,
  direction = null,
  callDatetime = null
}) {
  ensureFileExists(sourcePath);

  const stagedTmpPath = stageExternalFileToTemp(sourcePath);
  if (sourcePath !== stagedTmpPath) {
    try {
      fs.unlinkSync(sourcePath);
    } catch {
      // Source might be a preserved external file. Ignore cleanup failures.
    }
  }

  const saved = persistUploadedFile(stagedTmpPath, originalFilename || path.basename(sourcePath));

  const recording = createRecording({
    uploadedBy,
    originalFilename: originalFilename || path.basename(sourcePath),
    agentName,
    direction,
    callDatetime,
    status: "uploaded",
    originalPath: saved.originalPath,
    format: saved.format,
    sizeBytes: saved.sizeBytes,
    contentHash: saved.contentHash
  });

  enqueueRecordingConversion(recording.id);
  return recording;
}
