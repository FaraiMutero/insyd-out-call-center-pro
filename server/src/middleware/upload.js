import fs from "node:fs";
import path from "node:path";
import multer from "multer";

const maxFileSizeBytes = Number(process.env.UPLOAD_MAX_FILE_BYTES || 200 * 1024 * 1024);

const tmpDir = path.resolve(process.cwd(), "data", "tmp");
fs.mkdirSync(tmpDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tmpDir),
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${Math.random().toString(16).slice(2)}-${file.originalname}`;
    cb(null, safeName.replace(/[^A-Za-z0-9._-]/g, "_"));
  }
});

const allowedExt = new Set([".wav", ".mp3", ".m4a", ".ogg", ".opus", ".wma", ".amr"]);

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (!allowedExt.has(ext)) {
    cb(new Error("Unsupported file type"));
    return;
  }
  cb(null, true);
}

export const uploadSingleAudio = multer({
  storage,
  limits: { fileSize: maxFileSizeBytes },
  fileFilter
}).single("audio");
