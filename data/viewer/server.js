/**
 * InsydOut Data Viewer — standalone Express app.
 * Reads from ../app.db (the main app SQLite database).
 * Run: npm install && npm start   → http://localhost:4099
 */

import express from "express";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../app.db");
const PORT = Number(process.env.VIEWER_PORT) || 4099;

// Where growth-over-time samples are appended — sibling to app.db, not inside it,
// so this read-only viewer never needs to write to the app's own database file.
const STATS_HISTORY_PATH = path.resolve(__dirname, "../db-stats-history.jsonl");
const SAMPLE_INTERVAL_MS = Number(process.env.DB_STATS_INTERVAL_MS) || 5 * 60 * 1000; // 5 min
const MAX_HISTORY_SAMPLES = 500;

// "Comfort bands" for THIS app's setup (single-writer job worker, experimental
// node:sqlite) — not hard SQLite limits. SQLite itself handles far larger files;
// these just flag when it's worth thinking about Postgres for this project.
const THRESHOLDS = {
  fileSizeAmberMB: 100,
  fileSizeRedMB: 500,
  walRatioAmber: 2,
  walRatioRed: 5,
  fragPctAmber: 20,
  fragPctRed: 40,
};

let db;
try {
  db = new DatabaseSync(DB_PATH, { readonly: true });
} catch (err) {
  console.error(`\n  Cannot open database at ${DB_PATH}\n  ${err.message}\n`);
  process.exit(1);
}

function getUserTables() {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map(r => r.name);
}

function validateTable(name) {
  return getUserTables().includes(name);
}

function fileSizeSafe(p) {
  try { return fs.statSync(p).size; } catch { return 0; }
}

/* ── Resource stats ────────────────────────────────────────────────────── */

function computeDbStats() {
  const pageCount     = db.prepare("PRAGMA page_count").get().page_count;
  const pageSize      = db.prepare("PRAGMA page_size").get().page_size;
  const freelistCount = db.prepare("PRAGMA freelist_count").get().freelist_count;
  const journalMode   = db.prepare("PRAGMA journal_mode").get().journal_mode;

  const mainBytes = fileSizeSafe(DB_PATH);
  const walBytes  = fileSizeSafe(`${DB_PATH}-wal`);
  const shmBytes  = fileSizeSafe(`${DB_PATH}-shm`);

  // dbstat is an optional SQLite virtual table (compiled in by default in
  // Node's bundled build, but not guaranteed everywhere) — fall back to a
  // row-count-proportional estimate if it isn't available.
  let byteRows = [];
  let haveDbstat = true;
  try {
    byteRows = db.prepare(`
      SELECT m.tbl_name AS name, SUM(s.pgsize) AS bytes
      FROM dbstat s
      JOIN sqlite_master m ON m.name = s.name
      WHERE m.type IN ('table','index') AND m.tbl_name NOT LIKE 'sqlite_%'
      GROUP BY m.tbl_name
    `).all();
  } catch {
    haveDbstat = false;
  }

  const bytesByName = new Map(byteRows.map(r => [r.name, r.bytes]));
  const tableNames  = getUserTables();
  const rowsByName  = new Map(
    tableNames.map(t => [t, db.prepare(`SELECT COUNT(*) AS cnt FROM "${t}"`).get().cnt])
  );

  const totalRows  = [...rowsByName.values()].reduce((a, b) => a + b, 0) || 1;
  const totalBytes = haveDbstat
    ? ([...bytesByName.values()].reduce((a, b) => a + b, 0) || 1)
    : 1;

  const tables = tableNames
    .map(name => {
      const rows  = rowsByName.get(name) || 0;
      const bytes = haveDbstat ? (bytesByName.get(name) || 0) : null;
      const pct   = haveDbstat ? (bytes / totalBytes) * 100 : (rows / totalRows) * 100;
      return { name, rows, bytes, pct, estimated: !haveDbstat };
    })
    .sort((a, b) => b.pct - a.pct);

  return {
    generatedAt: new Date().toISOString(),
    file: { mainBytes, walBytes, shmBytes, totalBytes: mainBytes + walBytes + shmBytes },
    pragma: { pageCount, pageSize, freelistCount, journalMode },
    fragmentationPct: pageCount ? (freelistCount / pageCount) * 100 : 0,
    haveDbstat,
    tables,
  };
}

/* ── Growth history (sampled to a sibling .jsonl file) ───────────────────── */

function readHistory() {
  try {
    return fs.readFileSync(STATS_HISTORY_PATH, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

function maybeSample(stats) {
  const history = readHistory();
  const last = history[history.length - 1];
  const lastTime = last ? new Date(last.t).getTime() : 0;

  if (Date.now() - lastTime >= SAMPLE_INTERVAL_MS) {
    const sample = {
      t: stats.generatedAt,
      mainBytes: stats.file.mainBytes,
      walBytes: stats.file.walBytes,
      totalRows: stats.tables.reduce((a, t) => a + t.rows, 0),
      tables: stats.tables.map(t => ({ name: t.name, bytes: t.bytes, rows: t.rows })),
    };
    fs.appendFileSync(STATS_HISTORY_PATH, JSON.stringify(sample) + "\n");
    history.push(sample);
  }

  return history.slice(-MAX_HISTORY_SAMPLES);
}

/* ── Migration-readiness signals ──────────────────────────────────────────
   Heuristic guidance for THIS app's setup — see THRESHOLDS comment above.
   Not a verdict on SQLite's own capabilities. */

function buildMigrationSignals(stats, history) {
  const signals = [];
  const mainMB = stats.file.mainBytes / (1024 * 1024);

  let sizeLevel = "ok";
  if (mainMB > THRESHOLDS.fileSizeRedMB) sizeLevel = "red";
  else if (mainMB > THRESHOLDS.fileSizeAmberMB) sizeLevel = "amber";
  signals.push({
    key: "file_size", level: sizeLevel, label: "Main database file size",
    detail: `${mainMB.toFixed(1)} MB`,
    note: sizeLevel === "ok"
      ? "Comfortably within this app's single-writer setup."
      : "SQLite can handle far larger files reliably — this flag is about THIS app's setup (single-writer job worker, experimental node:sqlite, simple file backups), not a hard SQLite ceiling.",
  });

  const walRatio = stats.file.mainBytes > 0 ? stats.file.walBytes / stats.file.mainBytes : 0;
  let walLevel = "ok";
  if (walRatio > THRESHOLDS.walRatioRed) walLevel = "red";
  else if (walRatio > THRESHOLDS.walRatioAmber) walLevel = "amber";
  signals.push({
    key: "wal_growth", level: walLevel, label: "WAL file vs. main DB",
    detail: `${(stats.file.walBytes / (1024 * 1024)).toFixed(1)} MB WAL (${walRatio.toFixed(1)}× main file)`,
    note: walLevel === "ok"
      ? "WAL is checkpointing normally."
      : "The WAL is growing much faster than it's being checkpointed. Try `PRAGMA wal_checkpoint(TRUNCATE)`, or check for long-lived read connections holding it open.",
  });

  let fragLevel = "ok";
  if (stats.fragmentationPct > THRESHOLDS.fragPctRed) fragLevel = "red";
  else if (stats.fragmentationPct > THRESHOLDS.fragPctAmber) fragLevel = "amber";
  signals.push({
    key: "fragmentation", level: fragLevel, label: "Free-page fragmentation",
    detail: `${stats.fragmentationPct.toFixed(1)}% free pages`,
    note: fragLevel === "ok" ? "Low fragmentation." : "Consider running VACUUM to reclaim space.",
  });

  if (history.length >= 2) {
    const first = history[0];
    const last = history[history.length - 1];
    const days = (new Date(last.t) - new Date(first.t)) / 86400000;
    if (days > 0) {
      const bytesPerDay = (last.mainBytes - first.mainBytes) / days;
      const mbPerDay = bytesPerDay / (1024 * 1024);
      let note = "Not enough history yet for a reliable trend.";
      if (bytesPerDay > 0) {
        const remaining = THRESHOLDS.fileSizeRedMB * 1024 * 1024 - stats.file.mainBytes;
        note = remaining > 0
          ? `At this rate, expect to reach ${THRESHOLDS.fileSizeRedMB} MB in ~${Math.round(remaining / bytesPerDay)} day(s).`
          : `Already past the ${THRESHOLDS.fileSizeRedMB} MB comfort band.`;
      } else if (bytesPerDay <= 0) {
        note = "No net growth observed over the sampled period.";
      }
      signals.push({
        key: "growth_rate", level: "info", label: "Observed growth rate",
        detail: `${mbPerDay >= 0 ? "+" : ""}${mbPerDay.toFixed(2)} MB/day (over ${days.toFixed(1)}d of samples)`,
        note,
      });
    }
  } else {
    signals.push({
      key: "growth_rate", level: "info", label: "Observed growth rate",
      detail: "Collecting…",
      note: `Samples are taken at most once every ${Math.round(SAMPLE_INTERVAL_MS / 60000)} min. Check back later for a trend.`,
    });
  }

  signals.push({
    key: "concurrency", level: "info", label: "Write concurrency",
    detail: "SQLite allows one writer at a time",
    note: "This app's job worker already self-limits to ≤2 concurrent jobs to work within that. If you need multiple processes/servers writing concurrently, that's a stronger reason to move to Postgres than file size alone.",
  });

  return signals;
}

const app = express();

app.get("/api/tables", (_req, res) => {
  res.json(getUserTables());
});

app.get("/api/data/:table", (req, res) => {
  const { table } = req.params;
  if (!validateTable(table)) {
    return res.status(404).json({ error: "Table not found" });
  }
  const limit  = Math.min(Math.max(Number(req.query.limit)  || 500, 1), 5000);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const rows  = db.prepare(`SELECT * FROM "${table}" LIMIT ? OFFSET ?`).all(limit, offset);
  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM "${table}"`).get().cnt;

  res.json({ rows, total, limit, offset });
});

app.get("/api/db", (_req, res) => {
  try {
    const stats   = computeDbStats();
    const history = maybeSample(stats);
    const signals = buildMigrationSignals(stats, history);
    res.json({ stats, history, signals, sampleIntervalMs: SAMPLE_INTERVAL_MS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/db", (_req, res) => res.send(DB_HTML));

// Serve the SPA for every other route
app.get("*", (_req, res) => res.send(HTML));

app.listen(PORT, () => {
  console.log(`\n  ┌──────────────────────────────────────────┐`);
  console.log(`  │   InsydOut Data Viewer                   │`);
  console.log(`  │   http://localhost:${PORT}                  │`);
  console.log(`  │   Database: ${DB_PATH.split(/[\\/]/).pop()}                 │`);
  console.log(`  └──────────────────────────────────────────┘\n`);
});

/* ── Inline SPA ─────────────────────────────────────────────────────────── */

const HTML = /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>InsydOut — Data Viewer</title>
<style>
:root {
  --brand:   #8B7CFF;
  --brand-2: #5B8DEF;
  --pos:     #37D399;
  --risk:    #F4B740;
  --crit:    #FF6B6B;
  --ink:     #0B0E1A;
  --surface: #141829;
  --panel:   #1A1F30;
  --panel-2: #1F2540;
  --line:    rgba(255,255,255,.07);
  --line-s:  rgba(255,255,255,.13);
  --text:    #E8EAF0;
  --muted:   #7A839E;
  --faint:   #3C4460;
  --mono:    'JetBrains Mono','Fira Code','Cascadia Code',monospace;
  --sans:    'Inter','Segoe UI',system-ui,sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--ink);color:var(--text);font-family:var(--sans);font-size:13px;line-height:1.5;overflow:hidden}
::selection{background:rgba(139,124,255,.28)}
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--faint);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:var(--muted)}

/* ── Layout ── */
#root{display:flex;flex-direction:column;height:100vh;overflow:hidden}

/* ── Top bar ── */
#topbar{
  display:flex;align-items:center;gap:12px;
  padding:0 20px;height:52px;flex-shrink:0;
  background:var(--surface);border-bottom:1px solid var(--line);
}
.logo-mark{
  width:30px;height:30px;border-radius:8px;flex-shrink:0;
  background:linear-gradient(135deg,var(--brand),var(--brand-2));
  display:grid;place-items:center;font-weight:800;font-size:11px;color:#fff;letter-spacing:-.5px
}
.app-title{font-weight:700;font-size:15px;letter-spacing:-.2px}
.app-sub{font-size:11px;color:var(--muted);margin-left:4px}
.page-nav{display:flex;align-items:center;gap:2px;margin-left:18px}
.page-nav a{
  font-size:12.5px;font-weight:600;color:var(--muted);text-decoration:none;
  padding:6px 12px;border-radius:7px;transition:background .12s,color .12s
}
.page-nav a:hover{color:var(--text);background:rgba(255,255,255,.05)}
.page-nav a.active{color:var(--brand);background:rgba(139,124,255,.14)}
.db-badge{
  margin-left:auto;font-size:11px;font-family:var(--mono);
  background:rgba(255,255,255,.05);border:1px solid var(--line-s);
  padding:3px 10px;border-radius:6px;color:var(--muted)
}
.db-dot{width:7px;height:7px;border-radius:50%;background:var(--pos);display:inline-block;margin-right:6px}

/* ── Toolbar ── */
#toolbar{
  display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  padding:10px 20px;flex-shrink:0;
  background:var(--panel);border-bottom:1px solid var(--line);
}
label.lbl{font-size:12px;color:var(--muted);white-space:nowrap}

select#table-select{
  height:34px;padding:0 32px 0 12px;border-radius:8px;
  background:var(--panel-2) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237A839E' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center;
  border:1px solid var(--line-s);color:var(--text);font-size:13px;
  min-width:200px;appearance:none;cursor:pointer;outline:none;font-family:var(--mono)
}
select#table-select:focus{border-color:var(--brand)}
select#table-select:hover{border-color:var(--muted)}

/* ── Buttons ── */
.btn{
  height:34px;padding:0 14px;border-radius:8px;border:1px solid var(--line-s);
  background:var(--panel-2);color:var(--text);font-size:12px;font-weight:600;
  cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;
  transition:background .12s,border-color .12s;font-family:var(--sans)
}
.btn:hover{background:rgba(255,255,255,.07);border-color:var(--muted)}
.btn:active{background:rgba(255,255,255,.04)}
.btn-brand{background:rgba(139,124,255,.15);border-color:rgba(139,124,255,.35);color:var(--brand)}
.btn-brand:hover{background:rgba(139,124,255,.22)}
.btn svg{width:13px;height:13px;flex-shrink:0}

/* ── Search ── */
#search{
  margin-left:auto;height:34px;padding:0 12px 0 34px;border-radius:8px;
  background:var(--panel-2) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%237A839E' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='M21 21l-4.35-4.35'/%3E%3C/svg%3E") no-repeat left 10px center;
  border:1px solid var(--line-s);color:var(--text);font-size:13px;
  width:220px;outline:none
}
#search:focus{border-color:var(--brand);width:280px;transition:width .2s}
#search::placeholder{color:var(--faint)}

/* ── Status bar ── */
#statusbar{
  display:flex;align-items:center;gap:16px;
  padding:5px 20px;flex-shrink:0;
  background:var(--surface);border-bottom:1px solid var(--line);
  font-size:11.5px;color:var(--muted)
}
#statusbar .stat-sep{color:var(--faint)}
#statusbar strong{color:var(--text)}
.sort-indicator{color:var(--brand);font-size:10px}

/* ── Table wrapper ── */
#table-wrap{flex:1;overflow:auto;position:relative}

/* ── Data table ── */
#data-table{
  width:max-content;min-width:100%;border-collapse:collapse;
  font-size:12.5px;font-family:var(--mono)
}
#data-table thead{position:sticky;top:0;z-index:10}
#data-table thead th{
  background:var(--panel);border-bottom:1px solid var(--line-s);
  padding:9px 14px;text-align:left;white-space:nowrap;
  font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
  color:var(--muted);cursor:pointer;user-select:none;
  border-right:1px solid var(--line)
}
#data-table thead th:hover{background:var(--panel-2);color:var(--text)}
#data-table thead th.sorted{color:var(--brand)}
#data-table thead th .sort-icon{margin-left:4px;font-size:9px;opacity:.7}

#data-table tbody tr{border-bottom:1px solid var(--line);cursor:pointer}
#data-table tbody tr:nth-child(even){background:rgba(255,255,255,.016)}
#data-table tbody tr:hover td{background:rgba(139,124,255,.07)}
#data-table tbody td{
  padding:7px 14px;vertical-align:top;white-space:nowrap;
  max-width:320px;overflow:hidden;text-overflow:ellipsis;
  border-right:1px solid var(--line);color:var(--text)
}
#data-table tbody td.num{text-align:right;color:var(--brand-2)}
#data-table tbody td.null-val{color:var(--faint);font-style:italic}
#data-table tbody td .json-badge{
  display:inline-block;font-size:9px;font-weight:700;
  background:rgba(244,183,64,.14);color:var(--risk);
  padding:1px 5px;border-radius:3px;margin-right:5px;vertical-align:middle;
  font-family:var(--sans);letter-spacing:.04em
}
#data-table tbody td .bool-true{color:var(--pos);font-weight:600}
#data-table tbody td .bool-false{color:var(--crit);font-weight:600}

/* ── Empty / loading states ── */
#state-overlay{
  position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:12px;
  color:var(--muted);font-size:13px;pointer-events:none
}
.spinner{
  width:28px;height:28px;border:2px solid var(--faint);
  border-top-color:var(--brand);border-radius:50%;
  animation:spin .7s linear infinite
}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── Pagination ── */
#pagination{
  display:flex;align-items:center;gap:8px;justify-content:center;
  padding:10px 20px;flex-shrink:0;
  background:var(--surface);border-top:1px solid var(--line)
}
#pagination .page-btn{
  height:28px;min-width:28px;padding:0 10px;border-radius:6px;
  border:1px solid var(--line-s);background:var(--panel-2);
  color:var(--muted);font-size:12px;cursor:pointer;font-family:var(--sans)
}
#pagination .page-btn:hover:not(:disabled){background:rgba(255,255,255,.07);color:var(--text)}
#pagination .page-btn:disabled{opacity:.35;cursor:not-allowed}
#pagination .page-btn.active{background:rgba(139,124,255,.2);border-color:rgba(139,124,255,.4);color:var(--brand)}
#page-info{font-size:12px;color:var(--muted);padding:0 6px}

/* ── Column picker ── */
#col-picker-wrap{position:relative}
#col-panel{
  position:absolute;top:calc(100% + 6px);left:0;z-index:200;
  background:var(--panel);border:1px solid var(--line-s);border-radius:12px;
  width:240px;box-shadow:0 8px 32px rgba(0,0,0,.5);
  display:none;overflow:hidden
}
#col-panel.open{display:block}
.col-panel-head{
  display:flex;align-items:center;justify-content:space-between;
  padding:10px 14px 8px;border-bottom:1px solid var(--line)
}
.col-panel-head span{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}
.col-panel-actions{display:flex;gap:6px}
.col-action{
  font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;
  border:1px solid var(--line-s);background:none;color:var(--muted);
  cursor:pointer
}
.col-action:hover{color:var(--text);border-color:var(--muted)}
#col-list{
  max-height:280px;overflow-y:auto;padding:6px 0
}
.col-item{
  display:flex;align-items:center;gap:10px;padding:6px 14px;
  cursor:pointer;transition:background .1s
}
.col-item:hover{background:rgba(255,255,255,.04)}
.col-item input[type=checkbox]{
  width:14px;height:14px;accent-color:var(--brand);cursor:pointer;flex-shrink:0
}
.col-item label{
  font-size:12.5px;font-family:var(--mono);color:var(--text);
  cursor:pointer;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap
}

/* ── Row detail modal ── */
#row-modal-backdrop{
  position:fixed;inset:0;z-index:500;display:none;
  background:rgba(0,0,0,.6);align-items:center;justify-content:center;padding:24px
}
#row-modal-backdrop.open{display:flex}
#row-modal{
  width:100%;max-width:640px;max-height:80vh;display:flex;flex-direction:column;
  background:var(--panel);border:1px solid var(--line-s);border-radius:12px;
  box-shadow:0 16px 48px rgba(0,0,0,.55);overflow:hidden
}
.row-modal-head{
  display:flex;align-items:center;justify-content:space-between;
  padding:14px 18px;border-bottom:1px solid var(--line);flex-shrink:0
}
.row-modal-head span{font-size:13px;font-weight:700;color:var(--text);letter-spacing:-.1px}
#row-modal-close{
  height:28px;padding:0 12px;border-radius:6px;border:1px solid var(--line-s);
  background:var(--panel-2);color:var(--muted);font-size:11px;font-weight:700;
  cursor:pointer;font-family:var(--sans)
}
#row-modal-close:hover{color:var(--text);border-color:var(--muted)}
#row-modal-body{overflow-y:auto;padding:6px 18px 18px}
.row-modal-field{padding:10px 0;border-bottom:1px solid var(--line)}
.row-modal-field:last-child{border-bottom:none}
.row-modal-label{
  font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
  color:var(--brand);font-family:var(--mono);margin-bottom:4px
}
.row-modal-value{font-size:13px;color:var(--text);word-break:break-word}
.row-modal-value .modal-text{white-space:pre-wrap;font-family:var(--mono);font-size:12.5px}
.row-modal-value pre.modal-json{
  white-space:pre-wrap;font-family:var(--mono);font-size:12px;
  background:rgba(255,255,255,.04);border:1px solid var(--line);
  border-radius:6px;padding:8px 10px;margin:0;color:var(--text)
}

/* ── Tooltip ── */
[title]{cursor:default}

/* ── Responsive ── */
@media(max-width:640px){
  #search{margin-left:0;width:100%}
  #toolbar{flex-wrap:wrap}
}
</style>
</head>
<body>
<div id="root">

  <!-- Top bar -->
  <div id="topbar">
    <div class="logo-mark">IO</div>
    <span class="app-title">Data Viewer</span>
    <span class="app-sub">InsydOut Call Center Pro</span>
    <nav class="page-nav">
      <a href="/" class="active">Tables</a>
      <a href="/db">DB Health</a>
    </nav>
    <div class="db-badge"><span class="db-dot"></span>app.db</div>
  </div>

  <!-- Toolbar -->
  <div id="toolbar">
    <label class="lbl" for="table-select">Table</label>
    <select id="table-select">
      <option value="">— select a table —</option>
    </select>

    <div id="col-picker-wrap">
      <button class="btn btn-brand" id="col-btn" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18"/></svg>
        Columns
        <svg id="col-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div id="col-panel">
        <div class="col-panel-head">
          <span>Columns</span>
          <div class="col-panel-actions">
            <button class="col-action" id="col-all">All</button>
            <button class="col-action" id="col-none">None</button>
          </div>
        </div>
        <div id="col-list"></div>
      </div>
    </div>

    <button class="btn" id="refresh-btn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      Refresh
    </button>

    <input type="text" id="search" placeholder="Search rows…" />
  </div>

  <!-- Status bar -->
  <div id="statusbar">
    <span id="stat-table" style="color:var(--brand);font-family:var(--mono);font-weight:600">—</span>
    <span class="stat-sep">·</span>
    <span id="stat-rows">No table selected</span>
    <span class="stat-sep" id="stat-filter-sep" style="display:none">·</span>
    <span id="stat-filter" style="display:none"></span>
    <span class="stat-sep" id="stat-sort-sep" style="display:none">·</span>
    <span id="stat-sort" style="display:none"></span>
  </div>

  <!-- Table -->
  <div id="table-wrap">
    <div id="state-overlay">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" stroke-width="1.5" style="opacity:.5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
      <span id="overlay-msg">Select a table to view data</span>
    </div>
    <table id="data-table" style="display:none">
      <thead><tr id="thead-row"></tr></thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>

  <!-- Pagination -->
  <div id="pagination" style="display:none">
    <button class="page-btn" id="pg-first">«</button>
    <button class="page-btn" id="pg-prev">‹</button>
    <div id="page-numbers"></div>
    <button class="page-btn" id="pg-next">›</button>
    <button class="page-btn" id="pg-last">»</button>
    <span id="page-info"></span>
  </div>

</div>

<!-- Row detail modal -->
<div id="row-modal-backdrop">
  <div id="row-modal">
    <div class="row-modal-head">
      <span>Row Details</span>
      <button id="row-modal-close">✕ Close</button>
    </div>
    <div id="row-modal-body"></div>
  </div>
</div>

<script>
/* ── State ───────────────────────────────────────────────────────────── */
const S = {
  table:      null,
  allRows:    [],
  columns:    [],        // all column names from data
  visible:    new Set(), // currently visible columns
  sortCol:    null,
  sortDir:    'asc',
  search:     '',
  page:       0,
  pageSize:   100,
  total:      0,         // total rows in DB
  loading:    false,
  currentPageRows: [],   // rows currently rendered on screen, for modal lookup by index
};

/* ── DOM refs ─────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const tableSelect  = $('table-select');
const colBtn       = $('col-btn');
const colPanel     = $('col-panel');
const colList      = $('col-list');
const refreshBtn   = $('refresh-btn');
const searchInput  = $('search');
const dataTable    = $('data-table');
const theadRow     = $('thead-row');
const tbody        = $('tbody');
const overlay      = $('state-overlay');
const overlayMsg   = $('overlay-msg');
const pagination   = $('pagination');
const rowModalBackdrop = $('row-modal-backdrop');
const rowModalBody     = $('row-modal-body');
const rowModalClose    = $('row-modal-close');

/* ── Utilities ────────────────────────────────────────────────────────── */
function isNumeric(v) { return v !== null && v !== '' && !isNaN(Number(v)) && typeof v !== 'object'; }
function isJson(v) {
  if (typeof v !== 'string') return false;
  const t = v.trimStart();
  return (t.startsWith('{') || t.startsWith('[')) && v.length > 2;
}

function truncate(str, max = 80) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function renderCell(v) {
  if (v === null || v === undefined) return '<span class="null-val">—</span>';
  if (v === 1 || v === true)  return '<span class="bool-true">true</span>';
  if (v === 0 || v === false) return '<span class="bool-false">false</span>';
  if (isJson(String(v))) {
    const preview = truncate(String(v), 60);
    return '<span class="json-badge">JSON</span>' + escHtml(preview);
  }
  return escHtml(truncate(String(v), 90));
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function cellTitle(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return s.length > 60 ? s : '';
}

/* ── Row detail modal ────────────────────────────────────────────────────── */
function renderModalValue(v) {
  if (v === null || v === undefined) return '<span class="null-val">NULL</span>';
  if (v === 1 || v === true)  return '<span class="bool-true">true</span>';
  if (v === 0 || v === false) return '<span class="bool-false">false</span>';
  if (isJson(String(v))) {
    let pretty = String(v);
    try { pretty = JSON.stringify(JSON.parse(String(v)), null, 2); } catch {}
    return '<pre class="modal-json">' + escHtml(pretty) + '</pre>';
  }
  return '<div class="modal-text">' + escHtml(String(v)) + '</div>';
}

function openRowModal(row) {
  rowModalBody.innerHTML = S.columns.map(col => \`
    <div class="row-modal-field">
      <div class="row-modal-label">\${escHtml(col)}</div>
      <div class="row-modal-value">\${renderModalValue(row[col])}</div>
    </div>
  \`).join('');
  rowModalBackdrop.classList.add('open');
}

function closeRowModal() {
  rowModalBackdrop.classList.remove('open');
}

rowModalClose.addEventListener('click', closeRowModal);
rowModalBackdrop.addEventListener('click', e => {
  if (e.target === rowModalBackdrop) closeRowModal();
});

/* ── Status bar ───────────────────────────────────────────────────────── */
function updateStatus(filtered, total, rows) {
  $('stat-table').textContent = S.table || '—';
  if (!S.table) { $('stat-rows').textContent = 'No table selected'; return; }

  const dbStr = S.total !== rows.length
    ? \`<strong>\${S.total.toLocaleString()}</strong> rows in DB · loaded <strong>\${rows.length.toLocaleString()}</strong>\`
    : \`<strong>\${S.total.toLocaleString()}</strong> rows\`;

  $('stat-rows').innerHTML = dbStr;

  const filterSep = $('stat-filter-sep');
  const filterEl  = $('stat-filter');
  if (S.search) {
    filterSep.style.display = '';
    filterEl.style.display  = '';
    filterEl.innerHTML = \`<strong>\${filtered.toLocaleString()}</strong> matching "\${escHtml(S.search)}"\`;
  } else {
    filterSep.style.display = 'none';
    filterEl.style.display  = 'none';
  }

  const sortSep = $('stat-sort-sep');
  const sortEl  = $('stat-sort');
  if (S.sortCol) {
    sortSep.style.display = '';
    sortEl.style.display  = '';
    sortEl.innerHTML = \`sorted by <strong style="color:var(--brand);font-family:var(--mono)">\${S.sortCol}</strong> \${S.sortDir === 'asc' ? '↑' : '↓'}\`;
  } else {
    sortSep.style.display = 'none';
    sortEl.style.display  = 'none';
  }
}

/* ── Column picker ────────────────────────────────────────────────────── */
function buildColPicker() {
  colList.innerHTML = '';
  S.columns.forEach(col => {
    const item = document.createElement('div');
    item.className = 'col-item';
    const cb = document.createElement('input');
    cb.type    = 'checkbox';
    cb.id      = \`col-\${col}\`;
    cb.checked = S.visible.has(col);
    cb.addEventListener('change', () => {
      if (cb.checked) S.visible.add(col); else S.visible.delete(col);
      renderTable();
    });
    const lbl = document.createElement('label');
    lbl.htmlFor   = \`col-\${col}\`;
    lbl.textContent = col;
    lbl.title = col;
    item.append(cb, lbl);
    item.addEventListener('click', e => { if (e.target !== cb) cb.click(); });
    colList.appendChild(item);
  });
}

function setAllCols(checked) {
  S.columns.forEach(c => checked ? S.visible.add(c) : S.visible.delete(c));
  colList.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = checked; });
  renderTable();
}

colBtn.addEventListener('click', e => {
  e.stopPropagation();
  colPanel.classList.toggle('open');
});
document.addEventListener('click', e => {
  if (!colPanel.contains(e.target) && e.target !== colBtn) colPanel.classList.remove('open');
});
$('col-all').addEventListener('click',  () => setAllCols(true));
$('col-none').addEventListener('click', () => setAllCols(false));

/* ── Data fetch ───────────────────────────────────────────────────────── */
async function loadTables() {
  const res    = await fetch('/api/tables');
  const tables = await res.json();
  tableSelect.innerHTML = '<option value="">— select a table —</option>';
  tables.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    tableSelect.appendChild(opt);
  });
}

async function loadTable(name) {
  if (!name) return;
  S.loading   = true;
  S.table     = name;
  S.page      = 0;
  S.search    = '';
  S.sortCol   = null;
  S.sortDir   = 'asc';
  searchInput.value = '';

  overlay.style.display = 'flex';
  overlayMsg.innerHTML  = '<div class="spinner"></div>';
  dataTable.style.display = 'none';
  pagination.style.display = 'none';

  try {
    const res  = await fetch(\`/api/data/\${encodeURIComponent(name)}?limit=500\`);
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    S.allRows = data.rows;
    S.total   = data.total;
    S.columns = data.rows.length ? Object.keys(data.rows[0]) : [];
    S.visible = new Set(S.columns);

    colBtn.disabled = S.columns.length === 0;
    buildColPicker();
    renderTable();
  } catch (err) {
    overlay.style.display = 'flex';
    overlayMsg.textContent = 'Error loading data: ' + err.message;
  } finally {
    S.loading = false;
  }
}

/* ── Filtering + Sorting ──────────────────────────────────────────────── */
function getProcessedRows() {
  let rows = S.allRows;

  if (S.search) {
    const q = S.search.toLowerCase();
    rows = rows.filter(row =>
      Object.values(row).some(v => v !== null && String(v).toLowerCase().includes(q))
    );
  }

  if (S.sortCol) {
    const col = S.sortCol;
    const dir = S.sortDir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const va = a[col], vb = b[col];
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (isNumeric(va) && isNumeric(vb)) return (Number(va) - Number(vb)) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }

  return rows;
}

/* ── Render table ─────────────────────────────────────────────────────── */
function renderTable() {
  const processed = getProcessedRows();
  const visCols   = S.columns.filter(c => S.visible.has(c));

  /* Header */
  theadRow.innerHTML = visCols.map(col => {
    const sorted = S.sortCol === col;
    const icon   = sorted ? (S.sortDir === 'asc' ? '↑' : '↓') : '↕';
    return \`<th class="\${sorted ? 'sorted' : ''}" data-col="\${escHtml(col)}">\${escHtml(col)}<span class="sort-icon">\${icon}</span></th>\`;
  }).join('');

  /* Sort click handlers */
  theadRow.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (S.sortCol === col) {
        S.sortDir = S.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        S.sortCol = col;
        S.sortDir = 'asc';
      }
      S.page = 0;
      renderTable();
    });
  });

  /* Paginated slice */
  const start    = S.page * S.pageSize;
  const pageRows = processed.slice(start, start + S.pageSize);
  const totalPages = Math.max(1, Math.ceil(processed.length / S.pageSize));

  /* Body */
  S.currentPageRows = pageRows;
  tbody.innerHTML = pageRows.map((row, idx) =>
    \`<tr data-idx="\${idx}">\` + visCols.map(col => {
      const v   = row[col];
      const cls = isNumeric(v) ? 'num' : '';
      const ttl = cellTitle(v);
      return \`<td class="\${cls}" \${ttl ? \`title="\${escHtml(ttl)}"\` : ''}>\${renderCell(v)}</td>\`;
    }).join('') + '</tr>'
  ).join('');

  /* Show/hide */
  const hasData = visCols.length > 0;
  dataTable.style.display = hasData ? '' : 'none';
  overlay.style.display   = hasData && processed.length > 0 ? 'none' : 'flex';

  if (!hasData) {
    overlayMsg.textContent = 'No columns selected';
  } else if (processed.length === 0) {
    overlayMsg.textContent = S.search ? \`No rows match "\${S.search}"\` : 'This table is empty';
  }

  updateStatus(processed.length, S.total, S.allRows);
  renderPagination(processed.length, totalPages);
}

/* ── Pagination ───────────────────────────────────────────────────────── */
function renderPagination(filteredCount, totalPages) {
  pagination.style.display = filteredCount > 0 ? 'flex' : 'none';

  $('pg-first').disabled = S.page === 0;
  $('pg-prev').disabled  = S.page === 0;
  $('pg-next').disabled  = S.page >= totalPages - 1;
  $('pg-last').disabled  = S.page >= totalPages - 1;

  const start = S.page * S.pageSize + 1;
  const end   = Math.min((S.page + 1) * S.pageSize, filteredCount);
  $('page-info').textContent = \`\${start}–\${end} of \${filteredCount.toLocaleString()}\`;

  /* Page number buttons — show up to 7 */
  const nums = $('page-numbers');
  nums.innerHTML = '';
  const range = [];
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) range.push(i);
  } else {
    const left  = Math.max(0, S.page - 2);
    const right = Math.min(totalPages - 1, S.page + 2);
    if (left > 0)              range.push(0, '…');
    for (let i = left; i <= right; i++) range.push(i);
    if (right < totalPages - 1) range.push('…', totalPages - 1);
  }
  range.forEach(p => {
    if (p === '…') {
      const sp = document.createElement('span');
      sp.textContent = '…'; sp.style.color = 'var(--faint)'; sp.style.padding = '0 4px';
      nums.appendChild(sp);
    } else {
      const btn = document.createElement('button');
      btn.className = 'page-btn' + (p === S.page ? ' active' : '');
      btn.textContent = p + 1;
      btn.addEventListener('click', () => { S.page = p; renderTable(); });
      nums.appendChild(btn);
    }
  });
}

$('pg-first').addEventListener('click', () => { S.page = 0; renderTable(); });
$('pg-prev').addEventListener('click',  () => { S.page = Math.max(0, S.page - 1); renderTable(); });
$('pg-next').addEventListener('click',  () => { S.page++; renderTable(); });
$('pg-last').addEventListener('click',  () => {
  const p = getProcessedRows();
  S.page = Math.max(0, Math.ceil(p.length / S.pageSize) - 1);
  renderTable();
});

/* ── Event wiring ─────────────────────────────────────────────────────── */
tableSelect.addEventListener('change', () => {
  const t = tableSelect.value;
  if (t) loadTable(t);
});

refreshBtn.addEventListener('click', () => {
  if (S.table) loadTable(S.table);
});

let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    S.search = searchInput.value.trim();
    S.page   = 0;
    renderTable();
  }, 200);
});

/* Row click → open detail modal */
tbody.addEventListener('click', e => {
  const tr = e.target.closest('tr');
  if (!tr) return;
  const row = S.currentPageRows?.[Number(tr.dataset.idx)];
  if (row) openRowModal(row);
});

/* Keyboard: Escape closes column panel / row modal */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    colPanel.classList.remove('open');
    closeRowModal();
  }
});

/* ── Boot ─────────────────────────────────────────────────────────────── */
loadTables();
</script>
</body>
</html>`;

/* ── DB Health page ───────────────────────────────────────────────────── */

const DB_HTML = /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>InsydOut — DB Health</title>
<style>
:root {
  --brand:   #8B7CFF;
  --brand-2: #5B8DEF;
  --pos:     #37D399;
  --risk:    #F4B740;
  --crit:    #FF6B6B;
  --ink:     #0B0E1A;
  --surface: #141829;
  --panel:   #1A1F30;
  --panel-2: #1F2540;
  --line:    rgba(255,255,255,.07);
  --line-s:  rgba(255,255,255,.13);
  --text:    #E8EAF0;
  --muted:   #7A839E;
  --faint:   #3C4460;
  --mono:    'JetBrains Mono','Fira Code','Cascadia Code',monospace;
  --sans:    'Inter','Segoe UI',system-ui,sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--ink);color:var(--text);font-family:var(--sans);font-size:13px;line-height:1.5}
::selection{background:rgba(139,124,255,.28)}
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--faint);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:var(--muted)}

#root{display:flex;flex-direction:column;height:100vh;overflow:hidden}

#topbar{
  display:flex;align-items:center;gap:12px;
  padding:0 20px;height:52px;flex-shrink:0;
  background:var(--surface);border-bottom:1px solid var(--line);
}
.logo-mark{
  width:30px;height:30px;border-radius:8px;flex-shrink:0;
  background:linear-gradient(135deg,var(--brand),var(--brand-2));
  display:grid;place-items:center;font-weight:800;font-size:11px;color:#fff;letter-spacing:-.5px
}
.app-title{font-weight:700;font-size:15px;letter-spacing:-.2px}
.app-sub{font-size:11px;color:var(--muted);margin-left:4px}
.page-nav{display:flex;align-items:center;gap:2px;margin-left:18px}
.page-nav a{
  font-size:12.5px;font-weight:600;color:var(--muted);text-decoration:none;
  padding:6px 12px;border-radius:7px;transition:background .12s,color .12s
}
.page-nav a:hover{color:var(--text);background:rgba(255,255,255,.05)}
.page-nav a.active{color:var(--brand);background:rgba(139,124,255,.14)}
.db-badge{
  margin-left:auto;font-size:11px;font-family:var(--mono);
  background:rgba(255,255,255,.05);border:1px solid var(--line-s);
  padding:3px 10px;border-radius:6px;color:var(--muted)
}
.db-dot{width:7px;height:7px;border-radius:50%;background:var(--pos);display:inline-block;margin-right:6px}

.btn{
  height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--line-s);
  background:var(--panel-2);color:var(--text);font-size:12px;font-weight:600;
  cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;
  transition:background .12s,border-color .12s;font-family:var(--sans)
}
.btn:hover{background:rgba(255,255,255,.07);border-color:var(--muted)}
.btn svg{width:13px;height:13px;flex-shrink:0}

#page{flex:1;overflow-y:auto;padding:24px 28px 48px}
#page-inner{max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:24px}

.caption{font-size:12px;color:var(--muted);max-width:760px}
.row-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
h2.sec-title{font-size:13px;font-weight:700;letter-spacing:.02em;color:var(--text)}
.timestamp{font-size:11px;color:var(--faint);font-family:var(--mono)}

/* ── Summary cards ── */
.card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.stat-card{
  background:var(--panel);border:1px solid var(--line);border-radius:12px;
  padding:14px 16px;display:flex;flex-direction:column;gap:6px
}
.stat-card .lbl{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.stat-card .val{font-size:20px;font-weight:700;letter-spacing:-.3px;font-family:var(--mono)}
.stat-card .sub{font-size:11px;color:var(--faint)}

/* ── Table storage bars ── */
.panel-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 20px}
.tbl-row{display:grid;grid-template-columns:160px 1fr 90px 70px;gap:12px;align-items:center;padding:7px 0}
.tbl-row + .tbl-row{border-top:1px solid var(--line)}
.tbl-name{font-family:var(--mono);font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tbl-bar-track{height:8px;border-radius:5px;background:rgba(255,255,255,.05);overflow:hidden}
.tbl-bar-fill{height:100%;border-radius:5px;background:linear-gradient(90deg,var(--brand-2),var(--brand))}
.tbl-bytes{font-family:var(--mono);font-size:11.5px;color:var(--muted);text-align:right}
.tbl-pct{font-family:var(--mono);font-size:11.5px;color:var(--brand);text-align:right;font-weight:600}
.tbl-rows{font-size:10.5px;color:var(--faint);margin-top:1px}

/* ── Growth chart ── */
.chart-wrap{position:relative;height:160px}
.chart-empty{
  position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  color:var(--faint);font-size:12px
}
.chart-axis{font-size:10px;color:var(--faint);font-family:var(--mono)}
.chart-axis-row{display:flex;justify-content:space-between;margin-top:4px}

/* ── Migration signals ── */
.signal-card{
  display:flex;gap:12px;padding:13px 16px;border-radius:10px;
  background:var(--panel-2);border-left:3px solid var(--faint)
}
.signal-card.lvl-ok{border-left-color:var(--pos)}
.signal-card.lvl-amber{border-left-color:var(--risk)}
.signal-card.lvl-red{border-left-color:var(--crit)}
.signal-card.lvl-info{border-left-color:var(--brand-2)}
.signal-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;margin-top:4px}
.lvl-ok .signal-dot{background:var(--pos)}
.lvl-amber .signal-dot{background:var(--risk)}
.lvl-red .signal-dot{background:var(--crit)}
.lvl-info .signal-dot{background:var(--brand-2)}
.signal-body{display:flex;flex-direction:column;gap:3px}
.signal-label{font-size:12.5px;font-weight:700;color:var(--text)}
.signal-detail{font-size:12px;font-family:var(--mono);color:var(--muted)}
.signal-note{font-size:11.5px;color:var(--faint);line-height:1.5}
.signal-grid{display:flex;flex-direction:column;gap:10px}

#loading-overlay{
  position:fixed;inset:0;background:var(--ink);display:flex;align-items:center;justify-content:center;
  flex-direction:column;gap:12px;color:var(--muted);font-size:13px;z-index:50
}
.spinner{
  width:28px;height:28px;border:2px solid var(--faint);border-top-color:var(--brand);
  border-radius:50%;animation:spin .7s linear infinite
}
@keyframes spin{to{transform:rotate(360deg)}}
#loading-overlay.hidden{display:none}
</style>
</head>
<body>
<div id="loading-overlay"><div class="spinner"></div><span>Loading database stats…</span></div>
<div id="root">

  <div id="topbar">
    <div class="logo-mark">IO</div>
    <span class="app-title">Data Viewer</span>
    <span class="app-sub">InsydOut Call Center Pro</span>
    <nav class="page-nav">
      <a href="/">Tables</a>
      <a href="/db" class="active">DB Health</a>
    </nav>
    <div class="db-badge"><span class="db-dot"></span>app.db</div>
    <button class="btn" id="refresh-btn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      Refresh
    </button>
  </div>

  <div id="page">
    <div id="page-inner">

      <div>
        <h2 class="sec-title" style="margin-bottom:6px">Resource overview</h2>
        <p class="caption">Live snapshot of <code>app.db</code> on disk, including its WAL/SHM sidecar files. Refresh to re-read current values.</p>
      </div>
      <div class="card-grid" id="summary-cards"></div>

      <div class="panel-card">
        <div class="row-head" style="margin-bottom:14px">
          <h2 class="sec-title">Storage by table</h2>
          <span class="timestamp" id="table-total"></span>
        </div>
        <div id="table-rows"></div>
      </div>

      <div class="panel-card">
        <div class="row-head" style="margin-bottom:10px">
          <h2 class="sec-title">Growth over time</h2>
          <span class="timestamp" id="history-meta"></span>
        </div>
        <div class="chart-wrap" id="chart-wrap"></div>
        <div class="chart-axis-row" id="chart-axis-row"></div>
      </div>

      <div>
        <div class="row-head" style="margin-bottom:10px">
          <h2 class="sec-title">Migration readiness — should I move to PostgreSQL?</h2>
          <span class="timestamp" id="updated-at"></span>
        </div>
        <p class="caption" style="margin-bottom:12px">
          These are operational comfort signals for <em>this app's</em> single-writer setup on the experimental
          <code>node:sqlite</code> module — not hard SQLite limits. SQLite itself can reliably handle far larger
          databases; the strongest real reasons to move to Postgres are usually concurrent multi-process writers,
          replication, or needing a separate DB server, not file size alone.
        </p>
        <div class="signal-grid" id="signal-grid"></div>
      </div>

    </div>
  </div>

</div>

<script>
function fmtBytes(n) {
  if (n === null || n === undefined) return '—';
  if (n < 1024) return n + ' B';
  const units = ['KB','MB','GB','TB'];
  let v = n, i = -1;
  do { v /= 1024; i++; } while (v >= 1024 && i < units.length - 1);
  return v.toFixed(v < 10 ? 2 : 1) + ' ' + units[i];
}
function fmtNum(n) { return Number(n).toLocaleString(); }
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderSummary(stats) {
  const cards = [
    { lbl: 'Main DB file', val: fmtBytes(stats.file.mainBytes), sub: 'app.db' },
    { lbl: 'WAL file', val: fmtBytes(stats.file.walBytes), sub: stats.pragma.journalMode + ' mode' },
    { lbl: 'Total footprint', val: fmtBytes(stats.file.totalBytes), sub: 'db + wal + shm' },
    { lbl: 'Pages', val: fmtNum(stats.pragma.pageCount), sub: fmtBytes(stats.pragma.pageSize) + ' / page' },
    { lbl: 'Fragmentation', val: stats.fragmentationPct.toFixed(1) + '%', sub: 'free pages' },
    { lbl: 'Tracked rows', val: fmtNum(stats.tables.reduce((a,t)=>a+t.rows,0)), sub: stats.tables.length + ' tables' },
  ];
  document.getElementById('summary-cards').innerHTML = cards.map(c => \`
    <div class="stat-card">
      <span class="lbl">\${c.lbl}</span>
      <span class="val">\${c.val}</span>
      <span class="sub">\${c.sub}</span>
    </div>
  \`).join('');
}

function renderTables(stats) {
  const max = Math.max(...stats.tables.map(t => t.pct), 1);
  document.getElementById('table-total').textContent =
    stats.haveDbstat ? fmtBytes(stats.tables.reduce((a,t)=>a+(t.bytes||0),0)) + ' tracked' : 'estimated from row counts';
  document.getElementById('table-rows').innerHTML = stats.tables.map(t => \`
    <div class="tbl-row">
      <div>
        <div class="tbl-name" title="\${t.name}">\${t.name}</div>
        <div class="tbl-rows">\${fmtNum(t.rows)} row\${t.rows === 1 ? '' : 's'}</div>
      </div>
      <div class="tbl-bar-track"><div class="tbl-bar-fill" style="width:\${(t.pct / max * 100).toFixed(1)}%"></div></div>
      <div class="tbl-bytes">\${t.bytes === null ? '—' : fmtBytes(t.bytes)}</div>
      <div class="tbl-pct">\${t.pct.toFixed(1)}%</div>
    </div>
  \`).join('');
}

function renderChart(history) {
  const wrap = document.getElementById('chart-wrap');
  const axisRow = document.getElementById('chart-axis-row');
  document.getElementById('history-meta').textContent =
    history.length + ' sample' + (history.length === 1 ? '' : 's');

  if (history.length < 2) {
    wrap.innerHTML = '<div class="chart-empty">Not enough history yet — check back after a few samples accumulate.</div>';
    axisRow.innerHTML = '';
    return;
  }

  const W = 1000, H = 160, PAD = 8;
  const vals = history.map(h => h.mainBytes);
  const minV = Math.min(...vals), maxV = Math.max(...vals, minV + 1);
  const pts = history.map((h, i) => {
    const x = PAD + (i / (history.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((h.mainBytes - minV) / (maxV - minV)) * (H - PAD * 2);
    return \`\${x.toFixed(1)},\${y.toFixed(1)}\`;
  });
  const areaPts = \`\${PAD},\${H - PAD} \` + pts.join(' ') + \` \${W - PAD},\${H - PAD}\`;

  wrap.innerHTML = \`
    <svg viewBox="0 0 \${W} \${H}" preserveAspectRatio="none" style="width:100%;height:100%">
      <polygon points="\${areaPts}" fill="rgba(139,124,255,.12)" />
      <polyline points="\${pts.join(' ')}" fill="none" stroke="#8B7CFF" stroke-width="2" />
    </svg>
  \`;
  axisRow.innerHTML = \`
    <span class="chart-axis">\${fmtDate(history[0].t)} · \${fmtBytes(minV)}</span>
    <span class="chart-axis">\${fmtDate(history[history.length-1].t)} · \${fmtBytes(maxV)}</span>
  \`;
}

function renderSignals(signals) {
  document.getElementById('signal-grid').innerHTML = signals.map(s => \`
    <div class="signal-card lvl-\${s.level}">
      <div class="signal-dot"></div>
      <div class="signal-body">
        <span class="signal-label">\${s.label}</span>
        <span class="signal-detail">\${s.detail}</span>
        <span class="signal-note">\${s.note}</span>
      </div>
    </div>
  \`).join('');
}

async function load() {
  const overlay = document.getElementById('loading-overlay');
  try {
    const res = await fetch('/api/db');
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    renderSummary(data.stats);
    renderTables(data.stats);
    renderChart(data.history);
    renderSignals(data.signals);
    document.getElementById('updated-at').textContent = 'updated ' + fmtDate(data.stats.generatedAt);
  } catch (err) {
    document.getElementById('page-inner').innerHTML =
      '<div class="caption" style="color:var(--crit)">Failed to load DB stats: ' + err.message + '</div>';
  } finally {
    overlay.classList.add('hidden');
  }
}

document.getElementById('refresh-btn').addEventListener('click', load);
load();
</script>
</body>
</html>`;
