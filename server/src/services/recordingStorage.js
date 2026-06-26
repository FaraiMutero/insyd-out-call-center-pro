import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { dataRoot } from "../config/paths.js";

function monthlyOriginalDir(date = new Date()) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return path.join(dataRoot(), "recordings", yyyy, mm, "originals");
}

function sanitizeExtension(filename) {
  const ext = path.extname(filename || "").toLowerCase();
  const allow = new Set([".wav", ".mp3", ".m4a", ".ogg", ".opus", ".wma", ".amr"]);
  return allow.has(ext) ? ext : ".bin";
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

export function persistUploadedFile(tempFilePath, originalName) {
  const outputDir = monthlyOriginalDir();
  fs.mkdirSync(outputDir, { recursive: true });

  const ext = sanitizeExtension(originalName);
  const outputPath = path.join(outputDir, `${crypto.randomUUID()}${ext}`);
  fs.renameSync(tempFilePath, outputPath);

  const stats = fs.statSync(outputPath);
  return {
    originalPath: outputPath,
    format: ext.replace(".", "") || null,
    sizeBytes: stats.size,
    contentHash: sha256File(outputPath)
  };
}
