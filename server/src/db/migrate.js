import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./connection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../../migrations");

function ensureMigrationTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

export function runMigrations() {
  ensureMigrationTable();

  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const hasMigration = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?");

  for (const file of files) {
    if (hasMigration.get(file)) {
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(file);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
