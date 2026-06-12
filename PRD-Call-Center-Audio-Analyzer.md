# PRD — InsydOut Call Center Pro
## Call Center Audio Recordings Analyzer Platform

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | 10 June 2026 |
| **Authors** | Farai Mutero (Solution Architect), Themba Nkuna (Product Owner, InsydOut) |
| **Status** | Approved for implementation |
| **Stack** | Node.js + Express (API) · React (SPA) · SQLite (local DB) |
| **First milestone** | Working prototype in 2 days (demo call scheduled Friday) |

---

## 1. Background & Problem Statement

Call centers record every call, but analysis is manual: a QA person or team leader listens to a sample of calls and gives anecdotal feedback ("this agent struggles with X"). Most calls are never reviewed. Managers respond to poor sales performance by demanding *more* calls instead of diagnosing *why* calls fail, because they have no visibility into where the gaps are.

The first pilot client is an insurance brokerage running **OfficeCloud Business** (a cloud PBX at login.officecloud.co.za). Supervisors can view call logs (date/time, extension/SIP trunk, from/to numbers, duration, cost) and **download individual call recordings in WAV format**. The client has **no SOP / call standards document** today.

**InsydOut Call Center Pro** analyzes call recordings at scale using AI: it transcribes every uploaded call, summarizes it, scores it against a configurable standard (SOP), detects sentiment, highlights agent gaps and strengths, and rolls everything up into per-agent and management dashboards — replacing sampled manual QA with full-coverage automated QA plus AI coaching.

### Differentiation goal (from product owner)
The platform must visibly out-feature in-house QA tooling ("yours has 5 capabilities, ours has 15"). Capability breadth is a product strategy, so the architecture must make adding analysis modules cheap.

## 2. Goals & Success Criteria

1. **G1 — Full-coverage QA:** 100% of uploaded calls receive transcript, summary, sentiment, and score without human listening.
2. **G2 — Gap analysis per call and per agent:** every scored call lists what the agent did well, what needs improvement, and errors needing attention, benchmarked against an SOP rubric.
3. **G3 — Pilot-ready fast:** a clean download-then-upload workflow (no PBX integration required) that a non-technical supervisor can use on day one.
4. **G4 — Portable:** runs locally from a single machine; all data in one SQLite file + a local file store. No cloud dependency except the transcription/LLM APIs configured.
5. **G5 — Swappable AI providers:** Azure Speech-to-Text initially, replaceable with an open-source alternative (e.g. Whisper) through a provider interface, by configuration only.
6. **G6 — Enterprise scaffolding:** multi-user with roles, self-registration + admin approval, audit trail — credible in front of corporate clients from the first demo.

**Success at pilot:** client uploads ≥20 real calls under NDA, accuracy of transcripts/scoring is judged credible by their QA manager, and the Friday demo converts to a continued engagement.

## 3. Users & Roles

| Role | Description | Key permissions |
|---|---|---|
| **Admin** | InsydOut / client IT owner | Everything: user approval, role assignment, provider config, theme config, SOP management, delete data |
| **Manager** | Call center manager / team leader | Upload recordings, view all dashboards and all agents, manage SOPs/rubrics, export reports |
| **QA Analyst** | Quality assurance staff | Upload recordings, view/edit call analyses, annotate calls, cannot manage users or providers |
| **Agent** | Call center agent | View own calls, own scores, own coaching feed and tips only |

A user has exactly one role. Role checks are enforced server-side on every route (middleware) and mirrored in the UI (route guards + conditional rendering).

### Registration & approval flow (required)
1. Visitor self-registers: name, surname, email, password, requested role (default Agent).
2. Account created with status `pending`. User sees "awaiting approval" screen; cannot access the app.
3. Admin sees pending users in **Admin → Users**, approves (optionally changing role) or rejects with reason.
4. On approval the user can log in. The **first user ever registered is auto-approved as Admin** (bootstrap).
5. Admin can deactivate/reactivate any account. Deactivated users keep their data but cannot log in.

Authentication: email + password (bcrypt, cost 12), JWT access token (15 min) + refresh token (7 days, httpOnly cookie, rotated). Password reset via admin-issued reset link (no SMTP dependency in v1; display the link to the admin to share manually).

## 4. Scope

### In scope (v1 – Phases 1–2)
- Multi-user identity & access management as above
- Manual upload of call recordings (WAV, MP3; other formats converted via ffmpeg)
- Call metadata capture (agent, direction, date/time, customer ref, duration auto-detected)
- Transcription pipeline with provider abstraction (Azure STT default, Whisper-compatible alternative)
- Per-call AI analysis: summary, key points, sentiment, SOP gap analysis, scoring, strengths / improvements / errors
- SOP & rubric management, including **AI-generated SOP from best practices** when the client has none
- Dashboards: org overview, per-agent, per-call drill-down; PDF export of call reports and management reports
- Coaching feed per agent (AI suggestions derived from their analyzed calls) + Tip of the Day
- Multi-theme support, InsydOut theme as default
- Audit log of significant actions

### Phase 3 (designed for, not built in v1 — keep extension points)
- **Wellness module:** voice-tone fatigue/stress signals, wellness check-ins, motivational nudges, opt-in wellness chat with strict safety guardrails (the AI is not a counselor; it must surface professional resources for distress and never handle crisis content itself)
- **OfficeCloud integration:** bulk export / API ingestion directly from the PBX instead of manual download-upload
- Cloud storage ingestion (e.g. Google Drive folder watch)
- Churn/customer-intelligence analytics (broader InsydOut CVM vision)

### Out of scope
- Live/real-time call monitoring; telephony itself
- Payroll/HR system integration
- Multi-tenancy across companies (single-organization deployment in v1; keep `org_id` columns nullable-ready)

## 5. Functional Requirements

Requirement IDs are stable; acceptance criteria (AC) are testable.

### F1 — Identity & User Management
- **F1.1** Self-registration form with validation (email unique + format, password ≥10 chars with letters+digits). AC: duplicate email returns 409 with friendly message.
- **F1.2** Pending-approval gate. AC: pending user receives 403 `ACCOUNT_PENDING` on any API call except auth/status.
- **F1.3** Admin user list with filters (status, role), approve/reject/deactivate actions, role change. AC: every action writes an audit log row.
- **F1.4** JWT auth with refresh rotation; logout revokes refresh token. AC: expired access token returns 401; refresh works exactly once per token.
- **F1.5** Profile page: change name, password (re-auth required), avatar initials.
- **F1.6** Seed script creates demo users for all four roles (`npm run seed`).

### F2 — Recording Ingestion
- **F2.1** Drag-and-drop multi-file upload (Manager, QA, Admin). Accept `.wav`, `.mp3` natively; `.m4a`, `.ogg`, `.opus`, `.wma`, `.amr` are auto-converted to 16 kHz mono WAV via bundled ffmpeg (`fluent-ffmpeg` + `ffmpeg-static`). AC: a 25 MB WAV and an OGG both end in status `ready_for_transcription`.
- **F2.2** Per-file metadata form (editable later): agent (select from agent users **or free-text agent name** — pilot agents may not be platform users yet), call direction (inbound/outbound), call date/time, customer reference, campaign/queue tag, notes. Duration, format, size auto-extracted (ffprobe).
- **F2.3** Batch metadata: apply one agent/date to all files in a batch.
- **F2.4** File storage on local disk under `./data/recordings/{yyyy}/{mm}/{uuid}.wav`; original also retained. SQLite stores paths + metadata only.
- **F2.5** Upload constraints configurable: max file size (default 200 MB), max batch (default 50 files).
- **F2.6** Recording list view: status pipeline (`uploaded → converting → ready_for_transcription → transcribing → analyzing → complete → failed`), retry on failure, delete (Admin/Manager; soft delete).
- **F2.7** Duplicate detection by SHA-256 content hash. AC: re-uploading an identical file warns and links to the existing call.

### F3 — Transcription Service (provider-swappable)
- **F3.1** All transcription goes through a single interface:

```js
// server/src/providers/transcription/ITranscriptionProvider.js
// Implementations must be stateless; config injected.
class ITranscriptionProvider {
  /** @returns {Promise<{ text: string,
        segments: Array<{ start: number, end: number, speaker: string|null, text: string }>,
        language: string, durationSec: number, providerMeta: object }>} */
  async transcribe(wavFilePath, options) { throw new Error('not implemented'); }
  async healthCheck() { throw new Error('not implemented'); }
}
```

- **F3.2** `AzureSpeechProvider` (default): Azure Speech-to-Text batch/REST with diarization enabled (speaker A/B), `en-ZA` as default locale (South African English), configurable via env. Uses `microsoft-cognitiveservices-speech-sdk`.
- **F3.3** `WhisperProvider` (open-source alternative): calls a local/remote Whisper-compatible HTTP endpoint (`WHISPER_API_URL`, OpenAI-compatible `/v1/audio/transcriptions` shape, e.g. faster-whisper-server, speaches, or whisper.cpp server). Selecting it requires **zero code changes**: `TRANSCRIPTION_PROVIDER=whisper` in `.env`.
- **F3.4** Provider selection resolved at job time from Settings (DB) falling back to env. Admin Settings UI shows active provider + health check button.
- **F3.5** Queue: in-process job queue (`better-queue` or hand-rolled with SQLite job table — no Redis) with concurrency 2, exponential retry (3 attempts), and resumability after server restart (jobs re-queued from DB state).
- **F3.6** Transcript stored with segments + timestamps; transcript viewer highlights agent vs customer turns where diarization is available.
- **F3.7** AC: with valid Azure creds a 1-minute WAV produces a transcript in < 2 minutes; switching `TRANSCRIPTION_PROVIDER` to a mock provider (bundled, returns canned transcript — used in CI/demo without keys) yields end-to-end pipeline success offline.

### F4 — AI Call Analysis
All analysis goes through a swappable LLM provider interface mirroring F3 (`IAnalysisProvider`: `AnthropicProvider` default — `claude-sonnet` class model, `ANTHROPIC_API_KEY`; alternative `OpenAICompatibleProvider` for any OpenAI-compatible endpoint incl. local Ollama). A bundled `MockAnalysisProvider` returns deterministic fixtures for offline demo/tests.

Per completed transcript the analysis job produces one `call_analysis` row:

- **F4.1 Summary:** 3–6 sentence narrative + bullet key points discussed.
- **F4.2 Sentiment:** overall call sentiment (positive/neutral/negative + score −1..1), plus customer-only and agent-only sentiment and a simple sentiment-over-time series (per transcript segment) for charting.
- **F4.3 SOP gap analysis & scoring:** evaluated against the active rubric (F5). Output: total score 0–100, per-criterion score + evidence quote + timestamp reference.
- **F4.4 Strengths / Improvements / Errors:** "agent did well", "needs improvement", "errors needing attention" lists — each item tied to a rubric criterion or flagged `general`, with a verbatim supporting quote. This includes sales-specific checks: asked discovery questions, handled objections, positioned product correctly, attempted close.
- **F4.5 Outcome classification:** sale made / follow-up agreed / no sale / service resolved / unresolved / unclear (configurable label set).
- **F4.6 Compliance flags:** greeting/identification given, recording disclosure, misleading statements (configurable per rubric).
- **F4.7** All LLM outputs are strict JSON validated against a schema (zod); invalid responses retried once with repair prompt, then job marked `failed` with raw output stored for debugging.
- **F4.8** Re-analyze action (Manager/QA): re-runs analysis with current rubric/provider without re-transcribing; previous analyses are versioned, latest is default view.
- **F4.9** AC: a mock-provider run on the bundled sample transcript produces a rendered call report containing every element F4.1–F4.6.

### F5 — SOP & Rubric Management
- **F5.1** Upload SOP/training documents (PDF, DOCX, TXT, MD); text extracted (`pdf-parse`, `mammoth`) and stored.
- **F5.2** From an SOP, the LLM derives a **rubric**: 8–15 weighted criteria (name, description, weight, what-good-looks-like, what-bad-looks-like). Rubric is fully editable in the UI (add/remove/re-weight criteria; weights must sum to 100).
- **F5.3** **No-SOP path (pilot client requirement):** "Generate best-practice SOP" action creates an SOP + rubric from built-in best-practice templates per call type (outbound sales, inbound service, collections) via the LLM, clearly labeled "AI-generated — review before use".
- **F5.4** Exactly one rubric is **active** per call type at a time; analyses record which rubric version scored them. Activating a new rubric never rewrites old scores (use Re-analyze for that).
- **F5.5** AC: editing a criterion weight and re-analyzing a call changes its total score accordingly.

### F6 — Dashboards & Reporting
- **F6.1 Org dashboard (Manager/Admin/QA):** calls analyzed, average score, score trend, sentiment mix, outcome mix, compliance flag rate, top issues across teams — filterable by date range, agent, campaign, call type.
- **F6.2 Agent leaderboard:** ranking by average score with trend arrows; **top-performer traits** panel: LLM-synthesized common strengths of the top quartile, phrased as replicable behaviors for coaching the rest.
- **F6.3 Agent detail:** per-agent score history, criterion-level radar/bar (where they consistently lose points), call list, coaching feed.
- **F6.4 Call report (drill-down):** audio player synced to transcript (click segment → seek), summary, sentiment timeline, rubric scorecard with evidence, strengths/improvements/errors, QA annotations (free-text comments pinned to timestamps).
- **F6.5 PDF export:** call report and management summary report (date-range) exported via headless render (`puppeteer`) using a print stylesheet; includes InsydOut branding.
- **F6.6 CSV export** of the calls table with scores for spreadsheet users.
- **F6.7** Agents see only their own data (F6.3/F6.4 of self); leaderboard visibility to agents is a Manager-controlled toggle (default off).

### F7 — Coaching
- **F7.1 Coaching feed (per agent):** after each analyzed call, 2–4 concrete suggestions for the next call ("when the customer raises price, acknowledge then reframe value — you moved straight to discount on 3 of your last 5 calls"). Generated from the agent's recent analyses, not just the single call.
- **F7.2 Tip of the Day:** one rotating practical sales/service tip on the agent home screen; sourced from a curated seed list, optionally LLM-personalized to the agent's weakest criterion.
- **F7.3 Coach chat (on-demand):** chat panel where an agent can ask "how do I handle X objection?" — context = their role, their recent gap analysis, the active SOP. Clearly labeled AI. Guardrails: stays on professional coaching topics; if a user expresses personal distress, it responds with empathy, recommends speaking to a manager/professional support, and does not attempt counseling. All guardrail text lives in one prompt-template file for easy review.
- **F7.4** Manager view of an agent's coaching feed (read-only) to align human coaching with AI coaching.

### F8 — Theming & Branding
- **F8.1** Theme system: all colors/typography/radii via CSS custom properties; themes are JSON records in DB (name, token map, logo URL, light/dark variant). Admin can create/edit/preview themes and set the org default; users may pick any published theme (persisted per user).
- **F8.2 Default theme — "InsydOut"** (extracted from insydout.africa):

| Token | Value |
|---|---|
| `--font-family` | Inter, sans-serif |
| `--bg-body` | `#ffffff` |
| `--bg-subtle` | `#f8fafc` |
| `--text-main` | `#0f172a` |
| `--text-secondary` | `#475569` |
| `--text-light` | `#94a3b8` |
| `--accent-primary` | `#000000` (primary buttons: black, pill-shaped, white text) |
| `--accent-hover` | `#333333` |
| `--accent-deep` | `#00264D` (deep navy — charts, highlights) |
| `--border-color` | `#e2e8f0` |
| `--glass-bg` | `rgba(255,255,255,0.7)` (cards may use subtle glass effect) |
| `--radius-card` | 16px; buttons fully rounded (pill) |

  Look and feel: clean, white, generous whitespace, slate-grey secondary text, bold near-black headings — consistent with insydout.africa. A second bundled theme ("Slate Dark") proves multi-theme works.
- **F8.3** Charts read their palette from theme tokens (no hard-coded chart colors).

### F9 — Settings, Audit & Admin
- **F9.1** Settings UI (Admin): transcription provider + credentials, analysis provider + credentials, locale, upload limits, leaderboard visibility toggle. Secrets stored in DB encrypted at rest (AES-256-GCM, key from `APP_SECRET` env) and never returned to the client after save (masked).
- **F9.2** Audit log: login, registration decisions, role changes, uploads, deletes, rubric activation, provider changes, exports — searchable table (Admin).
- **F9.3** Health/status page: DB ok, ffmpeg present, provider health checks, queue depth.

## 6. Non-Functional Requirements

- **Portability:** single repo, `npm install && npm run dev` runs API + SPA; production = `npm run build && npm start` (Express serves the built React app). All state in `./data/app.db` (SQLite via `better-sqlite3`) + `./data/recordings/`. Backing up = copying `./data`.
- **DB migrations:** plain SQL files in `server/migrations/`, applied in order at boot with a `schema_migrations` table.
- **Performance:** UI lists paginated server-side; analysis of a 10-min call ≤ 5 min end-to-end with real providers; the queue must never block the HTTP server.
- **Security:** helmet, CORS locked to app origin, rate-limit auth endpoints, file-type sniffing on upload (magic bytes, not extension), path-traversal-safe file serving, parameterized SQL only. Recordings/transcripts are personal information — note POPIA: data stays local, deletion is honored by hard-deleting files + rows via Admin purge.
- **Reliability:** server restart mid-job resumes from DB job state; partial pipeline failure leaves the call in `failed` with error detail and a retry button.
- **Testing:** Vitest/Jest unit tests for providers (with mocks), auth middleware, rubric scoring math; one API integration test of the full pipeline using mock providers. `npm test` green is part of done.

## 7. Technical Architecture

### 7.1 Repository layout

```
insydout-callcenter-pro/
├── package.json            # workspaces: server, client
├── server/
│   ├── src/
│   │   ├── index.js        # express bootstrap
│   │   ├── db/             # sqlite init, migrations runner
│   │   ├── middleware/     # auth, rbac, errors, audit
│   │   ├── routes/         # auth, users, recordings, calls, sops, rubrics,
│   │   │                   # analyses, dashboards, coaching, themes, settings, exports
│   │   ├── services/       # pipeline orchestration, queue, scoring, pdf
│   │   ├── providers/
│   │   │   ├── transcription/  # ITranscriptionProvider, azure.js, whisper.js, mock.js, index.js (factory)
│   │   │   └── analysis/       # IAnalysisProvider, anthropic.js, openaiCompatible.js, mock.js, index.js
│   │   └── prompts/        # *.md prompt templates (analysis, rubric-gen, sop-gen, coaching)
│   ├── migrations/         # 001_init.sql ...
│   └── tests/
├── client/                 # Vite + React 18
│   └── src/
│       ├── api/            # fetch client, auth token handling
│       ├── theme/          # ThemeProvider, token CSS injection
│       ├── components/     # AudioTranscriptPlayer, ScoreCard, SentimentTimeline, ...
│       └── pages/          # Login, Register, PendingApproval, Dashboard, Recordings,
│                           # CallReport, Agents, AgentDetail, Coaching, SOPs, Admin*, Settings
└── data/                   # app.db + recordings (gitignored)
```

### 7.2 SQLite schema (core tables)

```sql
users(id PK, email UNIQUE, password_hash, first_name, last_name, role TEXT
      CHECK(role IN ('admin','manager','qa','agent')), status TEXT
      CHECK(status IN ('pending','active','rejected','deactivated')),
      theme_id NULL, created_at, approved_by NULL, approved_at NULL);
refresh_tokens(id PK, user_id FK, token_hash, expires_at, revoked_at NULL);
recordings(id PK, uploaded_by FK, original_filename, stored_path, original_path,
      format, duration_sec, size_bytes, content_hash, agent_user_id NULL,
      agent_name NULL, direction, call_datetime, customer_ref NULL, campaign NULL,
      notes NULL, status, error TEXT NULL, deleted_at NULL, created_at);
transcripts(id PK, recording_id FK UNIQUE, provider, language, full_text,
      segments_json, created_at);
sops(id PK, title, call_type, source TEXT CHECK(source IN ('uploaded','ai_generated')),
      original_filename NULL, extracted_text, created_by, created_at);
rubrics(id PK, sop_id FK NULL, call_type, version INT, is_active BOOL,
      criteria_json,  -- [{key,name,description,weight,good,bad}]
      created_at);
call_analyses(id PK, recording_id FK, rubric_id FK, version INT, provider,
      summary, key_points_json, sentiment_json, total_score REAL,
      criteria_scores_json, strengths_json, improvements_json, errors_json,
      outcome, compliance_json, raw_response NULL, status, created_at);
annotations(id PK, recording_id FK, user_id FK, timestamp_sec NULL, body, created_at);
coaching_items(id PK, agent_user_id FK NULL, agent_name NULL, source_analysis_id FK,
      body, criterion_key NULL, acknowledged BOOL DEFAULT 0, created_at);
themes(id PK, name, tokens_json, is_default BOOL, published BOOL, created_at);
settings(key PK, value_encrypted, updated_by, updated_at);
jobs(id PK, type TEXT, payload_json, status, attempts INT, last_error NULL,
      run_after, created_at, updated_at);
audit_log(id PK, user_id, action, entity, entity_id, detail_json, created_at);
```

### 7.3 API surface (REST, `/api/v1`)

```
POST   /auth/register | /auth/login | /auth/refresh | /auth/logout
GET    /auth/me
GET    /users?status=&role=          PATCH /users/:id (approve/reject/role/deactivate)
POST   /recordings  (multipart, batch)        GET /recordings?filters
GET    /recordings/:id   PATCH /recordings/:id (metadata)   DELETE /recordings/:id
POST   /recordings/:id/retry
GET    /recordings/:id/audio          (range-request streaming for the player)
GET    /calls/:recordingId/report     (transcript + latest analysis composite)
POST   /calls/:recordingId/reanalyze
POST   /sops (upload) | POST /sops/generate | GET /sops | GET /sops/:id
POST   /rubrics (from sop) | PATCH /rubrics/:id | POST /rubrics/:id/activate
GET    /dashboards/org?from=&to=&agent=&campaign=
GET    /dashboards/agents             GET /dashboards/agents/:id
GET    /coaching/feed?agent=          POST /coaching/chat   POST /coaching/:id/ack
GET    /exports/call/:id.pdf | /exports/management.pdf?from=&to= | /exports/calls.csv
GET/POST/PATCH /themes                GET/PUT /settings     GET /health
GET    /audit?filters
```

### 7.4 Pipeline orchestration

```
upload → (convert if needed: ffmpeg → 16k mono wav) → job:transcribe
  → ITranscriptionProvider.transcribe() → save transcript → job:analyze
  → IAnalysisProvider.analyze(transcript, rubric, prompts) → validate JSON (zod)
  → save call_analysis → job:coaching (regenerate agent coaching feed)
  → status: complete
```

Jobs table is the source of truth; a worker loop polls it (500 ms idle backoff). Concurrency: 2 transcriptions, 2 analyses. Provider factory reads Settings each job, so switching providers applies to the next job with no restart.

### 7.5 Environment & configuration

```
PORT=4000
APP_SECRET=...                     # JWT signing + settings encryption
TRANSCRIPTION_PROVIDER=azure       # azure | whisper | mock
AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=southafricanorth
AZURE_SPEECH_LOCALE=en-ZA
WHISPER_API_URL=http://localhost:8000/v1   # used when provider=whisper
ANALYSIS_PROVIDER=anthropic        # anthropic | openai_compatible | mock
ANTHROPIC_API_KEY=...
OPENAI_COMPAT_URL=... OPENAI_COMPAT_KEY=... OPENAI_COMPAT_MODEL=...
MAX_UPLOAD_MB=200  MAX_BATCH=50
```

DB Settings (when present) override env for provider choice/keys. **Mock providers must allow the entire app to run and demo with no keys and no internet.**

## 8. UX Notes (key screens)

1. **Login / Register / Pending-approval** — minimal, InsydOut-branded.
2. **Home (role-aware):** Manager → org dashboard; Agent → my scores + Tip of the Day + coaching feed.
3. **Recordings:** upload dropzone, batch metadata bar, pipeline-status table with live updates (poll every 5 s or SSE).
4. **Call Report:** the hero screen for the Friday demo — audio player with synced transcript, scorecard with evidence quotes, sentiment timeline, strengths/improvements/errors cards, export-PDF button.
5. **Agents / Agent detail:** leaderboard; criterion radar; top-performer traits panel.
6. **SOPs & Rubrics:** SOP list, generate-SOP wizard, rubric editor with weight slider validation.
7. **Admin:** Users (approval queue first), Themes (token editor + live preview), Settings (providers + health), Audit.

Visual language: InsydOut theme (Section F8.2). Dashboard density similar to Power BI-style cards: stat tiles on top, charts below (use Recharts).

## 9. Implementation Plan (for Claude Code)

**Phase 0 — Scaffold (½ day):** monorepo, Express + SQLite + migrations, Vite React, auth (F1 complete incl. approval flow), theme provider with InsydOut tokens, seed script.

**Phase 1 — Prototype for Friday demo (1½ days):** F2 upload/convert/store → F3 with **mock + Azure** providers → F4 with **mock + Anthropic** providers → F5.3 best-practice rubric (outbound sales) → Call Report screen → minimal org dashboard. Demo runs end-to-end with mock providers offline, and with real keys when available. Bundle 3 synthetic sample recordings + canned transcripts as fixtures (pilot's real recordings arrive only after NDA).

**Phase 2 — Pilot hardening (week 2):** F5 full SOP upload/derive/edit, F6 complete dashboards + PDF/CSV export, F7 coaching feed/tips/chat, F3.3 Whisper provider, F9 settings/audit/health, tests, agent role experience.

**Phase 3 — Roadmap:** wellness module, OfficeCloud/Drive ingestion, multi-tenancy, churn/CVM analytics.

### Definition of Done (v1)
- `npm install && npm run seed && npm run dev` works on a clean machine with no API keys (mock providers).
- All F1–F9 ACs pass; `npm test` green.
- Switching transcription to Whisper or analysis to an OpenAI-compatible endpoint requires only env/Settings changes.
- A full demo path works: register → approve → upload sample WAV → watch pipeline → open Call Report → export PDF → view agent dashboard.

## 10. Open Questions / Assumptions

| # | Item | Assumption until answered |
|---|---|---|
| 1 | OfficeCloud bulk export availability | Manual per-call WAV download; treat API/bulk as Phase 3 |
| 2 | Pilot SOP/scripts | None exist → ship F5.3 AI-generated best-practice SOP path |
| 3 | Real sample recordings | Blocked on NDA → synthetic fixtures bundled for build/demo |
| 4 | Output expectations beyond dashboards (PDF packs?) | PDF per call + management PDF + CSV included in v1 |
| 5 | Agent identities | Free-text agent names allowed; link to user accounts when agents onboard |
| 6 | Wellness scope & ethics review | Phase 3 only, opt-in, with guardrails; requires product-owner sign-off before build |

## 11. Requirement Traceability (source recordings)

| Requirement | Source |
|---|---|
| Analyze calls at scale, replace manual QA listening | VN 2026-06-09 (TN) |
| Speech-to-text + sentiment + summary/key insights | VN 2026-06-09 (FM) |
| WAV from OfficeCloud; MP3; codec conversion for other formats | VNs 2026-06-09/10 |
| Download-then-upload workflow; bulk export nice-to-have | VN 2026-06-10 (FM) |
| Gap analysis vs SOP, scoring, strengths/improvements/errors | VNs 2026-06-10 (TN/FM) |
| Generate SOP when client has none (pilot has none) | VNs 2026-06-10 |
| Dashboards, reporting, management metrics, outputs incl. PDFs | VNs 2026-06-09/10 |
| Top-performer traits replicated to strugglers; identify team gaps | VN 2026-06-10 (TN) |
| AI sales coaching on demand; tip of the day; wellness (tone/fatigue, safe-space chat) | VNs 2026-06-10 (TN/FM) — wellness = Phase 3 |
| Capability breadth as differentiator; keep adding modules | VN 2026-06-10 (TN) |
| 2-day prototype, Friday demo; synthetic data until NDA | VNs 2026-06-09/10 |
| Stack, SQLite portability, IAM with self-registration+approval, Azure STT swappable, multi-theme InsydOut branding | Project brief |

*Non-relevant chat content (SABC/Power BI workshop, Sage partnership, webinar logistics, LinkedIn posts, rates) intentionally excluded per brief.*
