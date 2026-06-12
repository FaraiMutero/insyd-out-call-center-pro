import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { completeJob, claimNextPendingJob, enqueueJob, failJob } from "../db/jobsRepository.js";
import {
  getRecordingById,
  updateRecordingAssets,
  updateRecordingStatus
} from "../db/recordingsRepository.js";

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

let workerTimer = null;
let workerBusy = false;

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function computeSha256(filePath) {
  const hash = crypto.createHash("sha256");
  const input = fs.readFileSync(filePath);
  hash.update(input);
  return hash.digest("hex");
}

function toWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec("pcm_s16le")
      .audioFrequency(16000)
      .audioChannels(1)
      .format("wav")
      .on("end", resolve)
      .on("error", reject)
      .save(outputPath);
  });
}

function probeDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(Number(data?.format?.duration || 0));
    });
  });
}

function dataRoot() {
  return path.resolve(process.cwd(), "data");
}

function monthlyRecordingDir(date = new Date()) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return path.join(dataRoot(), "recordings", yyyy, mm);
}

export async function processConvertRecordingJob(job) {
  const payload = JSON.parse(job.payload_json);
  const recordingId = Number(payload.recordingId);
  const recording = getRecordingById(recordingId);

  if (!recording) {
    throw new Error(`Recording ${recordingId} not found`);
  }

  if (!recording.original_path || !fs.existsSync(recording.original_path)) {
    updateRecordingStatus({ recordingId, status: "failed", error: "Original file not found" });
    throw new Error("Original file missing");
  }

  updateRecordingStatus({ recordingId, status: "converting", error: null });

  const outputDir = monthlyRecordingDir();
  ensureDirectory(outputDir);
  const outputPath = path.join(outputDir, `${recordingId}-${crypto.randomUUID()}.wav`);

  try {
    await toWav(recording.original_path, outputPath);
    const stats = fs.statSync(outputPath);
    const durationSec = await probeDuration(outputPath);

    updateRecordingAssets({
      recordingId,
      storedPath: outputPath,
      format: "wav",
      durationSec,
      sizeBytes: stats.size,
      contentHash: computeSha256(outputPath)
    });

    updateRecordingStatus({ recordingId, status: "ready_for_transcription", error: null });
  } catch (error) {
    updateRecordingStatus({ recordingId, status: "failed", error: String(error.message || error) });
    throw error;
  }
}

async function runOneJob() {
  if (workerBusy) {
    return;
  }

  const job = claimNextPendingJob();
  if (!job) {
    return;
  }

  workerBusy = true;
  try {
    if (job.type === "convert_recording") {
      await processConvertRecordingJob(job);
      completeJob(job.id);
    } else {
      failJob(job.id, `Unknown job type: ${job.type}`);
    }
  } catch (error) {
    failJob(job.id, String(error.message || error));
  } finally {
    workerBusy = false;
  }
}

export function startRecordingWorker() {
  if (workerTimer || process.env.NODE_ENV === "test") {
    return;
  }

  workerTimer = setInterval(() => {
    runOneJob().catch(() => {
      // Errors are captured at job level.
    });
  }, 1500);
}

export function stopRecordingWorker() {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}

export function enqueueRecordingConversion(recordingId) {
  return enqueueJob({ type: "convert_recording", payload: { recordingId } });
}
