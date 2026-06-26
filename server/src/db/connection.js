import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveFromRoot } from "../config/paths.js";

function resolveDbPath() {
  const configured = process.env.DB_FILE || "data/app.db";
  if (path.isAbsolute(configured)) {
    return configured;
  }
  // Always resolve relative paths from the project root, not process.cwd()
  return resolveFromRoot(configured);
}

const dbFilePath = resolveDbPath();
fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });

const db = new DatabaseSync(dbFilePath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

export { db, dbFilePath };
