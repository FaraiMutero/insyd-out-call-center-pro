import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

// Project root is 3 levels above this file: server/src/db/connection.js → server/src/db → server/src → server → root
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function resolveDbPath() {
  const configured = process.env.DB_FILE || "data/app.db";
  if (path.isAbsolute(configured)) {
    return configured;
  }
  // Always resolve relative paths from the project root, not process.cwd()
  return path.resolve(PROJECT_ROOT, configured);
}

const dbFilePath = resolveDbPath();
fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });

const db = new DatabaseSync(dbFilePath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

export { db, dbFilePath };
