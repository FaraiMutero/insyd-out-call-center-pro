import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { completeJob, claimNextPendingJob, enqueueJob, failJob } from "../db/jobsRepository.js";
import {
  getRecordingById,
  updateRecordingAssets,
  updateRecordingStatus
} from "../db/recordingsRepository.js";
import { upsertTranscript, getTranscriptByRecordingId } from "../db/transcriptRepository.js";
import {
  upsertCallAnalysis,
  getActiveRubric,
  replaceCoachingItemsForAgent,
} from "../db/analysisRepository.js";
import { transcribe as transcribeAudio } from "../providers/transcription/index.js";
import { analyze as analyzeCall } from "../providers/analysis/index.js";

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}
if (ffprobeInstaller?.path) {
  ffmpeg.setFfprobePath(ffprobeInstaller.path);
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
      // Force a fixed thread count: ffmpeg's auto-detected thread count divides by the
      // CPU core count, and under a sandboxed/restricted process affinity that count can
      // read as 0, crashing with STATUS_INTEGER_DIVIDE_BY_ZERO (exit code 3221225794).
      .outputOptions(["-threads", "1"])
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

  if (!recording.originalPath || !fs.existsSync(recording.originalPath)) {
    updateRecordingStatus({ recordingId, status: "failed", error: "Original file not found" });
    throw new Error("Original file missing");
  }

  updateRecordingStatus({ recordingId, status: "converting", error: null });

  const outputDir = monthlyRecordingDir();
  ensureDirectory(outputDir);
  const outputPath = path.join(outputDir, `${recordingId}-${crypto.randomUUID()}.wav`);

  try {
    await toWav(recording.originalPath, outputPath);
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

export async function processTranscribeJob(job) {
  const { recordingId } = JSON.parse(job.payload_json);
  const recording = getRecordingById(recordingId);

  if (!recording) throw new Error(`Recording ${recordingId} not found`);

  updateRecordingStatus({ recordingId, status: "transcribing", error: null });

  try {
    const result = await transcribeAudio(recording);
    upsertTranscript({
      recordingId,
      provider: result.provider,
      language: result.language,
      fullText: result.fullText,
      segments: result.segments,
    });
    updateRecordingStatus({ recordingId, status: "analyzing", error: null });
    enqueueJob({ type: "analyze_recording", payload: { recordingId } });
  } catch (error) {
    updateRecordingStatus({ recordingId, status: "failed", error: String(error.message || error) });
    throw error;
  }
}

export async function processAnalyzeJob(job) {
  const { recordingId } = JSON.parse(job.payload_json);
  const recording = getRecordingById(recordingId);

  if (!recording) throw new Error(`Recording ${recordingId} not found`);

  const transcript = getTranscriptByRecordingId(recordingId);
  if (!transcript) throw new Error(`Transcript not found for recording ${recordingId}`);

  const rubric = getActiveRubric(recording.direction === "inbound" ? "inbound" : "outbound_sales");
  if (!rubric) throw new Error("No active rubric found — run npm run seed:rubric or POST /api/sops/generate first");

  try {
    const result = await analyzeCall({ recording, transcript, rubric });
    upsertCallAnalysis({
      recordingId,
      rubricId: rubric.id,
      provider: result.provider,
      overallScore: result.overallScore,
      criteriaScores: result.criteriaScores,
      sentiment: result.sentiment,
      outcome: result.outcome,
      strengths: result.strengths,
      improvements: result.improvements,
      errors: result.errors,
      summary: result.summary,
    });

    updateRecordingStatus({ recordingId, status: "complete", error: null });

    if (recording.agentName) {
      enqueueJob({ type: "build_coaching", payload: { agentName: recording.agentName } });
    }
  } catch (error) {
    updateRecordingStatus({ recordingId, status: "failed", error: String(error.message || error) });
    throw error;
  }
}

export async function processBuildCoachingJob(job) {
  const { agentName } = JSON.parse(job.payload_json);
  if (!agentName) return;

  // Pull recent analyses for this agent and synthesise coaching items
  const recentRows = db.prepare(
    `SELECT ca.*, r.original_filename, r.id as rec_id
     FROM call_analyses ca
     JOIN recordings r ON r.id = ca.recording_id
     WHERE r.agent_name = ? AND r.deleted_at IS NULL
     ORDER BY ca.created_at DESC LIMIT 10`
  ).all(agentName);

  if (!recentRows.length) return;

  const items = [];

  // Collect recurring strengths
  const allStrengths = recentRows.flatMap(row => JSON.parse(row.strengths_json || "[]"));
  const strengthFreq = {};
  for (const s of allStrengths) strengthFreq[s] = (strengthFreq[s] || 0) + 1;
  const topStrengths = Object.entries(strengthFreq).sort((a, b) => b[1] - a[1]).slice(0, 2);
  for (const [content] of topStrengths) {
    items.push({ type: "strength", content, recordingId: null });
  }

  // Collect recurring improvements
  const allImprovements = recentRows.flatMap(row => JSON.parse(row.improvements_json || "[]"));
  const improvFreq = {};
  for (const s of allImprovements) improvFreq[s] = (improvFreq[s] || 0) + 1;
  const topImprovements = Object.entries(improvFreq).sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [content] of topImprovements) {
    items.push({ type: "improvement", content, recordingId: null });
  }

  replaceCoachingItemsForAgent(agentName, items);
}

// Needed for processBuildCoachingJob — import db directly for the ad-hoc query
import { db } from "../db/connection.js";

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
    switch (job.type) {
      case "convert_recording":
        await processConvertRecordingJob(job);
        enqueueJob({ type: "transcribe_recording", payload: JSON.parse(job.payload_json) });
        break;
      case "transcribe_recording":
        await processTranscribeJob(job);
        break;
      case "analyze_recording":
        await processAnalyzeJob(job);
        break;
      case "build_coaching":
        await processBuildCoachingJob(job);
        break;
      default:
        failJob(job.id, `Unknown job type: ${job.type}`);
        return;
    }
    completeJob(job.id);
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

export function enqueueTranscription(recordingId) {
  return enqueueJob({ type: "transcribe_recording", payload: { recordingId } });
}
