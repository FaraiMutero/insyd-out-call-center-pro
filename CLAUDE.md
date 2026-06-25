# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**InsydOut Call Center Pro** — a React + Node.js monorepo for AI-powered call-center recording analysis. It transcribes, scores, and coaches agents using swappable AI providers. The codebase is currently in **Phase 0** (scaffold complete); Phase 1 adds live transcription/analysis pipelines.

## Commands

### Development

```bash
# Install all workspace dependencies (root, server, client)
npm install

# Seed default demo users (admin/manager/qa/agent — password: Passw0rd123)
npm run seed

# Start API server on :4000 + background job worker
npm run dev

# Start Vite dev server on :5173 (proxies /api → :4000)
npm run dev:client
```

Run both `npm run dev` and `npm run dev:client` in separate terminals for full local development.

### Testing

```bash
# Run all tests across workspaces
npm test

# Run server tests only
cd server && npm test

# Run a single test file
node --test server/tests/integration.test.js
```

Tests use Node.js's built-in `node:test` module — no Jest, no Mocha.

### Build

```bash
# Build client for production (outputs to client/dist, served by Express)
npm run build
```

## Architecture

### Monorepo Layout

```
/
├── server/        Express API + SQLite + job worker
├── client/        React 18 + Vite 5 SPA
└── data/          Runtime data (.gitignored): app.db, recordings/
```

### Backend (`server/src/`)

**Entry point:** `index.js` → starts Express (`app.js`) + spawns the job worker (`recordingPipeline.js`).

**Request lifecycle:** `routes/` → `services/` → `db/` repositories. Middleware is applied in `app.js` (Helmet, CORS, cookie-parser, auth, error handler).

**Database:** SQLite via Node's built-in `node:sqlite` (`DatabaseSync`). Schema is managed by numbered SQL migrations in `server/migrations/`. Connection singleton lives in `db/connection.js`.

**Job queue:** In-process SQLite-backed worker (`services/recordingPipeline.js`). Polls every 500 ms idle, runs ≤2 concurrent jobs, retries up to 3× with exponential backoff, and resumes on server restart from the `jobs` table.

**Recording pipeline status flow:**  
`uploaded` → `converting` → `ready_for_transcription` → `transcribing` → `analyzing` → `complete` (or `failed`)

**Provider abstraction (`server/src/providers/`):**  
`transcription/` and `analysis/` directories are currently empty — Phase 1 will add concrete implementations behind `ITranscriptionProvider` and `IAnalysisProvider` interfaces. Provider selection happens at job-run time from DB settings, falling back to env vars.

### Frontend (`client/src/`)

**Routing:** `main.jsx` bootstraps `BrowserRouter`; `App.jsx` owns top-level route definitions and shared state (`user`, `recordings`, `auditLogs`).

**API layer:** `api/client.js` — a thin fetch wrapper that handles token storage (localStorage), auto-retry on 401 via `/api/auth/refresh`, and typed methods for every endpoint.

**Theming:** CSS custom properties defined in `theme/brandTokens.css` (royal blue + ink gray palette). All component styles reference these tokens.

### Auth Model

- **Access token:** JWT, 15 min, sent as Bearer header, stored in localStorage.
- **Refresh token:** JWT, 7 days, stored in httpOnly cookie (`path=/api/auth`). Rotated on every use; old JTI tracked in `refresh_tokens` table.
- **Roles:** `admin`, `manager`, `qa`, `agent` — enforced server-side by `middleware/auth.js` (`requireRole(...)`).
- **User status:** `pending` → `active`/`rejected`/`deactivated`. Pending users receive `403 ACCOUNT_PENDING` on every authenticated request. First registered user is auto-approved as admin.

### Key Environment Variables

Copy `.env.example` to `.env`. Required for any local run:

| Variable | Purpose |
|---|---|
| `APP_SECRET` | JWT signing key |
| `PORT` | API port (default 4000) |
| `DB_FILE` | SQLite file path (default `./data/app.db`) |
| `TRANSCRIPTION_PROVIDER` | `azure` \| `whisper` |
| `ANALYSIS_PROVIDER` | `anthropic` \| `openai_compatible` \| `deepseek` |

There is no mock/offline provider — `TRANSCRIPTION_PROVIDER` and `ANALYSIS_PROVIDER` must each name a real provider with its corresponding API credentials set (`ANTHROPIC_API_KEY`, `AZURE_SPEECH_KEY`, etc.), or the server refuses to start.

### Database Migrations

Migrations in `server/migrations/` run automatically on server start via `db/migrate.js`. Add new migrations as `NNN_description.sql` — they run in numeric order and are tracked so they don't re-run.

### Audit Trail

All significant actions (registration, approvals, uploads, deletes) are written to `audit_log` via `db/auditRepository.js`. Every service that mutates data is expected to emit audit events.
