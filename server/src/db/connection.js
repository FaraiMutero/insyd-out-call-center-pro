import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function resolveDbPath() {
  const configured = process.env.DB_FILE || "data/app.db";
  if (path.isAbsolute(configured)) {
    return configured;
  }

  const fromCwd = path.resolve(process.cwd(), configured);
  const fromParent = path.resolve(process.cwd(), "..", configured);

  if (fs.existsSync(path.dirname(fromCwd))) {
    return fromCwd;
  }
  return fromParent;
}

const dbFilePath = resolveDbPath();
fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });

const db = new DatabaseSync(dbFilePath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

export { db, dbFilePath };
