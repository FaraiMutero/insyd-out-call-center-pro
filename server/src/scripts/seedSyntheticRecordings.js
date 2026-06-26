import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { resolveFromRoot } from "../config/paths.js";
import { runMigrations } from "../db/migrate.js";
import { getUserByEmail } from "../db/usersRepository.js";
import { importRecordingFromExternalPath } from "../services/recordingIngestion.js";

const sampleCalls = [
  { file: "insurance_quote_objection.wav", durationSec: 52, freq: 440, direction: "outbound", agentName: "Ayo Agent" },
  { file: "policy_renewal_followup.wav", durationSec: 38, freq: 520, direction: "outbound", agentName: "Mina Manager" },
  { file: "claims_status_inbound.wav", durationSec: 64, freq: 360, direction: "inbound", agentName: "Qana Analyst" },
  { file: "upsell_home_cover.wav", durationSec: 46, freq: 600, direction: "outbound", agentName: "Ayo Agent" },
  { file: "customer_cancellation_risk.wav", durationSec: 70, freq: 300, direction: "inbound", agentName: "Mina Manager" }
];

function ensureExternalSourceFiles(sourceDir) {
  fs.mkdirSync(sourceDir, { recursive: true });

  for (const call of sampleCalls) {
    const fullPath = path.join(sourceDir, call.file);
    if (fs.existsSync(fullPath)) {
      continue;
    }

    if (!ffmpegPath) {
      throw new Error("ffmpeg binary is unavailable for synthetic recording generation");
    }

    const toneInput = `sine=frequency=${call.freq}:duration=${call.durationSec}`;
    const result = spawnSync(
      ffmpegPath,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        toneInput,
        "-ar",
        "16000",
        "-ac",
        "1",
        fullPath
      ],
      { stdio: "ignore" }
    );

    if (result.status !== 0) {
      throw new Error(`ffmpeg failed generating ${call.file}`);
    }
  }
}

function pickUploaderId() {
  const manager = getUserByEmail("manager@insydout.local");
  const admin = getUserByEmail("admin@insydout.local");
  const user = manager || admin;

  if (!user) {
    throw new Error("No seeded admin/manager found. Run npm run seed -w server first.");
  }

  return user.id;
}

function isoAtOffset(hoursAgo) {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

function main() {
  runMigrations();

  const sourceDir = resolveFromRoot("data", "external-source-recordings");
  ensureExternalSourceFiles(sourceDir);

  const uploaderId = pickUploaderId();
  const created = [];

  sampleCalls.forEach((call, index) => {
    const recording = importRecordingFromExternalPath({
      uploadedBy: uploaderId,
      sourcePath: path.join(sourceDir, call.file),
      originalFilename: call.file,
      agentName: call.agentName,
      direction: call.direction,
      callDatetime: isoAtOffset(index + 1)
    });
    created.push(recording.id);
  });

  console.log(`Seeded ${created.length} synthetic recordings from external source folder:`);
  console.log(sourceDir);
  console.log(`Recording IDs: ${created.join(", ")}`);
  console.log("These entries are imported and queued for conversion.");
}

main();
