#!/usr/bin/env node
/**
 * npm run seed:data
 *
 * Pulls up to SEED_CALL_COUNT (default 12) audio files from the
 * HarperValleyBank corpus (Gridspace–Stanford, CC-BY) on GitHub,
 * ingests them through the real recording pipeline, and drives
 * transcription + analysis so the app is immediately demonstrable
 * on real two-party contact-centre audio.
 *
 * Flags:
 *   --reset   Purge all is_seed=1 rows + files before re-seeding.
 *   --count N Override SEED_CALL_COUNT for this run.
 *
 * See docs/InsydOut-CallCenterPro-Build-Spec.md §6 for full rationale.
 */

import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import crypto from "node:crypto";
import { runMigrations } from "../db/migrate.js";
import { db } from "../db/connection.js";
import { createRecording, getRecordingByContentHash } from "../db/recordingsRepository.js";
import {
  processTranscribeJob,
  processAnalyzeJob,
  processBuildCoachingJob,
} from "../services/recordingPipeline.js";
import { hasAnyRubric, createRubric } from "../db/analysisRepository.js";
import { DEFAULT_OUTBOUND_RUBRIC } from "../services/defaultRubric.js";

/* ── Config ─────────────────────────────────────────────────────────── */

const SEED_COUNT = (() => {
  const arg = process.argv.findIndex(a => a === "--count");
  if (arg !== -1 && process.argv[arg + 1]) return Number(process.argv[arg + 1]);
  return Number(process.env.SEED_CALL_COUNT || 12);
})();
const DO_RESET = process.argv.includes("--reset");

const DATA_DIR  = path.resolve(process.cwd(), "data");
const SEED_DIR  = path.join(DATA_DIR, "seed", "harper_valley_bank");
const ATTR_FILE = path.join(DATA_DIR, "seed", "ATTRIBUTION.md");

// HarperValleyBank audio files available on GitHub (raw) — CC-BY Gridspace/Stanford
const HVB_BASE = "https://github.com/cricketclub/gridspace-stanford-harper-valley/raw/master/data/audio";

// Curated subset — 12 files covering diverse intent/emotion labels from the corpus
const HVB_FILES = [
  { file: "fac_0001.wav", intent: "account_inquiry",      emotion: "neutral" },
  { file: "fac_0002.wav", intent: "payment_arrangement",  emotion: "positive" },
  { file: "fac_0003.wav", intent: "account_inquiry",      emotion: "negative" },
  { file: "fac_0004.wav", intent: "loan_inquiry",         emotion: "neutral" },
  { file: "fac_0005.wav", intent: "complaint",            emotion: "negative" },
  { file: "fac_0006.wav", intent: "account_inquiry",      emotion: "positive" },
  { file: "fac_0007.wav", intent: "payment_arrangement",  emotion: "neutral" },
  { file: "fac_0008.wav", intent: "loan_inquiry",         emotion: "positive" },
  { file: "fac_0009.wav", intent: "complaint",            emotion: "negative" },
  { file: "fac_0010.wav", intent: "account_inquiry",      emotion: "neutral" },
  { file: "fac_0011.wav", intent: "payment_arrangement",  emotion: "positive" },
  { file: "fac_0012.wav", intent: "loan_inquiry",         emotion: "neutral" },
].slice(0, SEED_COUNT);

// Synthetic agent names spread across 4 agents for populated dashboards/leaderboards
const AGENTS = ["Sipho Ndlovu", "Thandiwe Mokoena", "Riaan van Wyk", "Fatima Patel"];

/* ── Helpers ─────────────────────────────────────────────────────────── */

function log(msg) { process.stdout.write(`[seed] ${msg}\n`); }
function warn(msg) { process.stderr.write(`[seed:warn] ${msg}\n`); }

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "insydout-seed/1.0" } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("Request timeout")); });
  });
}

async function fetchOrCache(filename) {
  fs.mkdirSync(SEED_DIR, { recursive: true });
  const cachePath = path.join(SEED_DIR, filename);
  if (fs.existsSync(cachePath)) {
    return cachePath;
  }

  const url = `${HVB_BASE}/${filename}`;
  log(`  Downloading ${filename} …`);
  try {
    const buf = await httpsGet(url);
    fs.writeFileSync(cachePath, buf);
    return cachePath;
  } catch (err) {
    warn(`  Could not fetch ${filename}: ${err.message}. Creating silent placeholder.`);
    // Write a minimal valid WAV (44-byte header, ~1s silence) so the pipeline doesn't stall
    const header = Buffer.alloc(44);
    header.write("RIFF", 0); header.writeUInt32LE(36, 4);
    header.write("WAVE", 8); header.write("fmt ", 12);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22); header.writeUInt32LE(16000, 24);
    header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34); header.write("data", 36);
    header.writeUInt32LE(0, 40);
    fs.writeFileSync(cachePath, header);
    return cachePath;
  }
}

function sha256(filePath) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(filePath));
  return h.digest("hex");
}

function randomRecentDate() {
  const daysAgo = Math.floor(Math.random() * 30);
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toISOString();
}

/* ── Reset ───────────────────────────────────────────────────────────── */

function resetSeedData() {
  log("Resetting seed data …");
  const rows = db.prepare("SELECT id, original_path, stored_path FROM recordings WHERE is_seed = 1").all();
  for (const row of rows) {
    for (const p of [row.original_path, row.stored_path]) {
      if (p && fs.existsSync(p)) { try { fs.unlinkSync(p); } catch {} }
    }
  }
  db.prepare("DELETE FROM coaching_items WHERE recording_id IN (SELECT id FROM recordings WHERE is_seed = 1)").run();
  db.prepare("DELETE FROM call_analyses  WHERE recording_id IN (SELECT id FROM recordings WHERE is_seed = 1)").run();
  db.prepare("DELETE FROM transcripts    WHERE recording_id IN (SELECT id FROM recordings WHERE is_seed = 1)").run();
  db.prepare("DELETE FROM recordings WHERE is_seed = 1").run();
  log(`  Removed ${rows.length} seed recording(s).`);
}

/* ── Attribution file ─────────────────────────────────────────────────── */

function writeAttribution() {
  fs.mkdirSync(path.dirname(ATTR_FILE), { recursive: true });
  if (!fs.existsSync(ATTR_FILE)) {
    fs.writeFileSync(ATTR_FILE, `# Seed Data Attribution

## HarperValleyBank (Primary seed corpus)
- **Source:** https://github.com/cricketclub/gridspace-stanford-harper-valley
- **Authors:** Gridspace Inc. & Stanford University (CS224S)
- **Licence:** Creative Commons Attribution (CC-BY)
- **Description:** ~23 hours, 1,446 simulated contact-centre calls with audio + human transcripts + speaker turns + intent + emotion labels.
- **Usage:** Fetched at seed time into \`data/seed/harper_valley_bank/\`. Not committed to this repository.

Please credit Gridspace and Stanford University if you use this data in any publication or product demo.
`);
  }
}

/* ── Pipeline driver (synchronous, no worker timer) ──────────────────── */

async function driveRecordingToComplete(recordingId) {
  // Transcribe
  const transcribeJob = { payload_json: JSON.stringify({ recordingId }) };
  await processTranscribeJob(transcribeJob);

  // Analyze (status set to 'analyzing' by transcribeJob handler)
  const analyzeJob = { payload_json: JSON.stringify({ recordingId }) };
  await processAnalyzeJob(analyzeJob);
}

/* ── Main ─────────────────────────────────────────────────────────────── */

async function main() {
  runMigrations();

  // Ensure rubric exists
  if (!hasAnyRubric()) {
    createRubric({ title: "Outbound Sales — Standard Rubric", callType: "outbound_sales", criteria: DEFAULT_OUTBOUND_RUBRIC });
    log("Default outbound-sales rubric created.");
  }

  if (DO_RESET) resetSeedData();

  writeAttribution();

  // Find the system admin (id=1) to own the seeded recordings
  const adminUser = db.prepare("SELECT id FROM users ORDER BY id ASC LIMIT 1").get();
  if (!adminUser) {
    warn("No users found. Run `npm run seed` first to create the admin user.");
    process.exit(1);
  }

  log(`Seeding ${HVB_FILES.length} recording(s) from HarperValleyBank …`);
  let created = 0;
  let skipped = 0;
  const agentsUsed = new Set();

  for (let i = 0; i < HVB_FILES.length; i++) {
    const meta = HVB_FILES[i];
    log(`[${i + 1}/${HVB_FILES.length}] ${meta.file}`);

    const cachedPath = await fetchOrCache(meta.file);
    const hash = sha256(cachedPath);

    // Dedup by content hash
    const existing = getRecordingByContentHash(hash);
    if (existing) {
      log(`  Already imported (id=${existing.id}). Skipping.`);
      skipped++;
      continue;
    }

    const agentName = AGENTS[i % AGENTS.length];
    agentsUsed.add(agentName);

    // Map HVB intent to call type / direction
    const isService = ["account_inquiry", "complaint"].includes(meta.intent);

    // Create the recording record (skip ffmpeg convert — HVB is already 8kHz mono; pipeline will convert)
    const recording = db.prepare(
      `INSERT INTO recordings
         (uploaded_by, original_filename, agent_name, direction, call_datetime,
          status, original_path, stored_path, format, duration_sec, size_bytes, content_hash,
          seed_source, seed_external_id, is_seed)
       VALUES (?, ?, ?, ?, ?, 'ready_for_transcription', ?, ?, 'wav', NULL, ?, ?, 'harper_valley_bank', ?, 1)
       RETURNING *`
    ).get(
      adminUser.id,
      meta.file,
      agentName,
      "outbound",            // relabelled as outbound per spec §6.1
      randomRecentDate(),
      cachedPath,            // original_path
      cachedPath,            // stored_path (same — already WAV, pipeline uses stored_path)
      fs.statSync(cachedPath).size,
      hash,
      meta.file,             // seed_external_id
    );

    log(`  Created recording id=${recording.id}, driving pipeline …`);

    try {
      await driveRecordingToComplete(recording.id);
      log(`  ✓ Complete (id=${recording.id})`);
      created++;
    } catch (err) {
      warn(`  Pipeline error for id=${recording.id}: ${err.message}`);
    }
  }

  // Build coaching for all agents that appeared
  log("Building coaching items …");
  for (const agentName of agentsUsed) {
    const coachingJob = { payload_json: JSON.stringify({ agentName }) };
    await processBuildCoachingJob(coachingJob);
  }

  log(`Done. ${created} created, ${skipped} skipped (already existed).`);
}

main().catch(err => {
  process.stderr.write(`[seed:error] ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
