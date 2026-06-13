# Build Spec — InsydOut Call Center Pro
## From scaffold to a fully functional outbound call-centre analysis app, seeded with real GitHub call audio

| | |
|---|---|
| **Document type** | Implementation / build specification (delta on the approved PRD v1.0) |
| **Target repo** | `FaraiMutero/insyd-out-call-center-pro` (commit `b735c44`, single "scaffold" commit) |
| **Companion doc** | `PRD-Call-Center-Audio-Analyzer.md` (product requirements — still authoritative for *what* and *why*) |
| **This doc covers** | *How* to take the current scaffold to a working end-to-end app, and how to seed it with real call-centre recordings pulled from GitHub for test/demo |
| **Date** | 13 June 2026 |
| **Status** | Draft for build |

> This spec assumes the PRD as the source of truth for product scope, roles, and acceptance criteria. It does **not** restate the PRD. It records (a) the exact gap between the scaffold and "fully functional", (b) the build order to close it, and (c) a new, fully-specified **GitHub seed-data module** — the one capability the PRD only sketched (it assumed synthetic fixtures because real recordings were NDA-blocked).

---

## 0. The riskiest assumption (read this first)

**"Real *outbound* call-centre recordings are freely available on GitHub" is only half true — and the gap matters.**

Truly real outbound *sales* call audio (an agent dialling a customer) is almost never openly downloadable: it is dense with PII and biometric voice data, so the large "real" corpora deliberately **withhold the audio** and publish transcripts only. For example, `CallCenterEN` (91,706 conversations / ~10,448 audio hours) ships transcripts but **no audio** "due to biometric privacy concerns". The vendor datasets that do include audio (AxonData, Macgence, Datamundi) are **commercial, licence-gated, not on GitHub**.

What *is* freely on GitHub, with a clean licence and real human telephone audio, is **simulated contact-centre audio** — chiefly **HarperValleyBank** (Gridspace–Stanford, CC-BY): ~23 hours, 1,446 human-human contact-centre calls, with audio + transcripts + speaker turns + intent + emotion labels. These are *inbound* bank-service calls, not outbound sales — but for **exercising and validating the transcription → analysis → scoring pipeline**, that distinction is cosmetic: the audio is real two-party telephone speech with agent/customer turns, which is exactly what the pipeline consumes.

**Decision baked into this spec:** seed primarily from **HarperValleyBank**, supplemented with a handful of public telephony sample WAVs, and tag the seeded direction so the demo can present them as outbound. When the pilot's real outbound WAVs arrive under NDA, they drop into the *same* ingestion path with zero code change. If you require genuinely *outbound-sales* audio before the NDA, the only honest options are (a) generate synthetic outbound calls with TTS from sales scripts, or (b) licence a commercial set — both flagged in §6.4. **Pressure-test this before building:** if "real" to your product owner strictly means real outbound sales voices, the GitHub path cannot satisfy it and we should agree on synthetic-TTS or a paid corpus instead.

---

## 1. Current state — scaffold audit (commit `b735c44`)

The repo is a single scaffold commit. Verified contents:

**Built and working (≈ PRD Phase 0 + the first slice of Phase 1):**

- **Monorepo** — root `package.json` with npm workspaces `server`, `client`; scripts `dev`, `dev:client`, `build`, `start`, `test`.
- **Server** (`server/src`): `app.js`, `index.js`; folders `auth`, `db`, `middleware`, `routes`, `scripts`, `services`, `utils`.
  - Routes present: `authRoutes`, `userRoutes`, `recordingRoutes`, `auditRoutes`.
  - Services present: `authService`, `recordingIngestion`, `recordingStorage`, `recordingPipeline`.
  - **Pipeline today** does exactly one thing: a polling job worker (`setInterval` 1500 ms, single-flight) that handles a `convert_recording` job — ffmpeg → 16 kHz mono PCM WAV, ffprobe duration, SHA-256 hash, then sets recording status `converting → ready_for_transcription`. There is no transcription or analysis step yet.
- **Migrations** (`server/migrations`): `001_init.sql` (users/auth/audit), `002_recordings.sql`, `003_pipeline.sql` (a `jobs` table — `type, payload_json, status[pending|running|completed|failed], attempts, last_error, run_after` — plus recording asset columns: `original_path, stored_path, format, duration_sec, size_bytes, content_hash`).
- **Client** (`client/src`): Vite + React; `App.jsx`, `main.jsx`, `styles.css`; folders `api`, `components`, `pages`, `theme`. Pages: `Login`, `Register`, `Pending`, `Profile`, `Users`, `Audit`, `Recordings`, `Dashboard` (stub), `NotFound`.
- **Docs**: `PRD-Call-Center-Audio-Analyzer.md`, `CLAUDE.md`, `.env.example`.

**Not built yet (the gap to "fully functional"):**

| PRD area | Status |
|---|---|
| F1 Identity / approval / RBAC | **Mostly built** (auth, users, pending-approval, audit). Verify JWT refresh rotation + first-user-auto-admin against AC. |
| F2 Recording ingestion | **Partly built** — upload + convert + hash + status exist. Missing: duplicate-by-hash warning UX, batch metadata apply, retry-from-failed UI, soft delete, range-streaming audio endpoint. |
| F3 Transcription (provider-swappable) | **Not built.** No `providers/transcription`, no `transcripts` table, no `transcribe` job. |
| F4 AI analysis (provider-swappable) | **Not built.** No `providers/analysis`, no `call_analyses` table, no `analyze`/`coaching` jobs, no zod schemas. |
| F5 SOP & rubric | **Not built.** No `sops`/`rubrics` tables, no SOP upload/extract, no AI rubric-gen. |
| F6 Dashboards & reporting | **Not built** (Dashboard page is a stub). No org/agent/leaderboard/call-report; no PDF/CSV export. |
| F7 Coaching | **Not built.** |
| F8 Theming | **Partial/unknown** — `theme` folder exists; verify token system + DB-backed themes. |
| F9 Settings / encrypted secrets / health | **Not built** (audit log table exists; settings + health page do not). |
| Seed with **real** recordings | **Not built** — and is the headline of this spec (§6). |

**One-line conclusion:** the scaffold gives us identity + a recording-conversion pipeline and a job runner. "Fully functional" means building the **transcription provider → analysis provider → rubric scoring → call report → dashboards/coaching** spine on top, plus the **GitHub seed module** so the whole thing is demonstrable on real audio with zero manual file wrangling.

---

## 2. Target definition — what "fully functional" means here

Scoped to the user's stated goal: *outbound call-centre companies upload (or seed) call recordings, the app turns them into text transcripts, and analyses agent performance.* A build is "done" when this path runs end-to-end on a clean machine:

```
npm install
npm run seed:data          # NEW — pulls real call audio from GitHub, ingests, runs pipeline
# open the app → log in as a seeded manager
# → Recordings list shows seeded calls at status "complete"
# → open a Call Report: synced audio+transcript, rubric scorecard, strengths/improvements/errors, sentiment
# → open Agent dashboard: per-agent scores, leaderboard, coaching feed
# → export the call report to PDF
```

…**with mock providers, offline, no API keys** — and identically with real Azure/Whisper + Anthropic/OpenAI-compatible keys when present. Provider choice is config-only (PRD F3/F4).

**Definition of Done (this build):** PRD §"Definition of Done (v1)" **plus** the seed-data AC in §6.6 below.

---

## 3. Architecture deltas to implement

Everything below is *additive* to the scaffold and follows the layout the PRD already prescribes (`server/src/providers/...`, `server/src/prompts/...`). No rewrite.

### 3.1 New / changed database migrations

Add forward-only SQL files (the runner already applies `migrations/*.sql` in order):

- **`004_transcripts.sql`** — `transcripts(id, recording_id UNIQUE FK, provider, language, full_text, segments_json, created_at)`.
- **`005_analysis.sql`** — `sops`, `rubrics`, `call_analyses`, `annotations`, `coaching_items` exactly as the PRD §7.2 schema.
- **`006_settings_themes.sql`** — `themes`, `settings(key PK, value_encrypted, updated_by, updated_at)`.
- **`007_seed_provenance.sql`** — seed-tracking columns on `recordings`: `seed_source TEXT NULL` (e.g. `harper_valley_bank`), `seed_external_id TEXT NULL`, `is_seed INTEGER DEFAULT 0`. Lets seeded data be filtered out of "real" reporting and bulk-purged cleanly (POPIA-friendly).
- Extend the **`jobs`** status vocabulary handling in code to route new `type` values (`transcribe`, `analyze`, `coaching`). The table already supports arbitrary `type`; only the worker's `switch` needs new branches.

### 3.2 Provider abstractions (the core of "swappable AI")

```
server/src/providers/
  transcription/
    ITranscriptionProvider.js   # interface from PRD F3.1
    azure.js                    # AzureSpeechProvider (en-ZA, diarization)
    whisper.js                  # OpenAI-compatible /v1/audio/transcriptions
    mock.js                     # deterministic canned transcript (offline/CI/demo)
    index.js                    # factory: reads Settings(DB) → env → default
  analysis/
    IAnalysisProvider.js
    anthropic.js                # default (claude-sonnet class)
    openaiCompatible.js         # any OpenAI-compatible endpoint incl. local Ollama
    mock.js                     # deterministic fixture analysis
    index.js                    # factory
```

- Build order: **mock first** (unblocks the whole pipeline and all tests offline), then **Whisper** (free/self-host path — aligns with the lean default), then **Azure**/**Anthropic** behind keys.
- The factory reads `settings` (DB) per job, falling back to env (PRD F3.4). Switching provider must require **zero code change**.

### 3.3 Pipeline worker — extend, don't replace

`recordingPipeline.js` currently handles only `convert_recording`. Extend the worker `switch` and chain jobs:

```
convert_recording  → (on success) enqueue transcribe
transcribe         → ITranscriptionProvider.transcribe(wav) → save transcripts row → enqueue analyze
analyze            → load active rubric → IAnalysisProvider.analyze(transcript, rubric, prompts)
                     → zod-validate → save call_analyses row → enqueue coaching
coaching           → regenerate agent coaching_items from recent analyses → status: complete
```

Keep the existing single-flight loop for now; bump to the PRD's concurrency-2 model in hardening. Status enum on `recordings` extends to the PRD pipeline: `uploaded → converting → ready_for_transcription → transcribing → analyzing → complete → failed`.

### 3.4 New API routes (under `/api/v1`, mirror PRD §7.3)

Add route files: `callRoutes` (`/calls/:id/report`, `/calls/:id/reanalyze`), `sopRoutes`, `rubricRoutes`, `dashboardRoutes`, `coachingRoutes`, `themeRoutes`, `settingsRoutes`, `exportRoutes`, plus `recordings/:id/audio` (HTTP range streaming for the player). RBAC middleware already exists — apply it per route.

### 3.5 New frontend pages/components

Add pages: `CallReport` (the demo hero — audio player synced to transcript, scorecard, sentiment timeline, strengths/improvements/errors), `Agents` (leaderboard), `AgentDetail`, `Coaching`, `SOPs`, `Settings`, and an Admin `Themes` editor. Components: `AudioTranscriptPlayer`, `ScoreCard`, `SentimentTimeline`, `RubricEditor`, stat tiles. Charts via Recharts, palette from theme tokens (PRD F8.3).

### 3.6 Prompt templates

`server/src/prompts/*.md`: `analysis.md`, `rubric-gen.md`, `sop-gen.md`, `coaching.md`, and the **guardrail** block for coach chat (PRD F7.3) in one file for easy review. All LLM outputs are strict JSON validated with **zod**; one repair-retry, then `failed` with `raw_response` stored (PRD F4.7).

---

## 4. Build order (phased, solo-operator friendly)

Each phase ends in something demoable. Leverage note: **Phase A is 80% of the perceived value** (real audio in → scored call report out). Do not gold-plate F8 theming or F9 audit polish until A and B work.

**Phase A — Make the spine work on real audio (the "wow"):**
1. Migrations `004`/`005` + seed-provenance `007`.
2. `providers/transcription/mock.js` + `whisper.js`; `providers/analysis/mock.js` + `anthropic.js`; both factories.
3. Extend pipeline worker with `transcribe`/`analyze`/`coaching` job types.
4. `POST /sops/generate` best-practice **outbound-sales** rubric (PRD F5.3) so there's an active rubric to score against on day one.
5. `GET /calls/:id/report` + `recordings/:id/audio` range streaming.
6. `CallReport` page + `AudioTranscriptPlayer`.
7. **GitHub seed module (§6)** — so all of the above runs on real audio with one command.

**Phase B — Make it a product:**
8. Dashboards (org, agent, leaderboard) + `AgentDetail`.
9. Coaching feed + Tip of the Day.
10. SOP upload/extract/derive/edit (full F5); rubric editor UI.
11. PDF (puppeteer) + CSV export.

**Phase C — Hardening / enterprise polish:**
12. Settings UI + encrypted secrets (AES-256-GCM) + health page (F9).
13. Azure + OpenAI-compatible providers behind keys; concurrency-2 queue; restart-resume.
14. Theming admin (F8), Slate-Dark second theme.
15. Tests green (Vitest): providers (mock), auth middleware, rubric scoring math, one full-pipeline integration test on a seeded sample.

---

## 5. Outbound-specific analysis (don't lose the brief)

The user's goal names **outbound** call centres and **agent performance**. Make the default rubric and analysis outbound-sales-shaped so the product is sharp out of the box:

- **Default rubric (`call_type = outbound_sales`)** generated by `POST /sops/generate`, ~10 weighted criteria summing to 100, e.g.: *opening & identification, permission/compliance disclosure, needs discovery (open questions), value/product positioning, objection handling, price framing, closing attempt, next-step secured, talk/listen ratio, professionalism & tone.*
- **Outcome label set** for outbound: `sale_made | follow_up_agreed | callback_scheduled | not_interested | gatekeeper_blocked | no_answer_voicemail | unclear` (PRD F4.5 is configurable — set this list as the outbound default).
- **Agent-performance rollups** (the explicit ask): per-agent average score, criterion-level radar (where they consistently lose points), trend over time, **top-performer-traits** panel (LLM-synthesised common strengths of the top quartile, phrased as replicable coaching behaviours — PRD F6.2), and a coaching feed derived from the agent's recent calls.

---

## 6. NEW MODULE — GitHub seed data (`npm run seed:data`)

This is the headline deliverable of this spec. It makes the app demonstrable on **real call-centre audio** pulled from GitHub, end-to-end, with one command and no manual file handling.

### 6.1 Primary source — HarperValleyBank (Gridspace–Stanford)

- **Repo:** `github.com/cricketclub/gridspace-stanford-harper-valley`
- **What it is:** ~23 hours, **1,446 human-human simulated contact-centre calls**, 59 speakers, with **audio + human transcripts + per-turn timing + speaker ID + caller-intent + dialog-act + emotional-valence** labels. Built for Stanford CS224S.
- **Licence:** Creative Commons (CC-BY) / public-domain-style — **free to use with attribution.** Record attribution in `data/seed/ATTRIBUTION.md` and in the app's About/health page.
- **Why it's the right pick:** it is the only GitHub-hosted corpus that is simultaneously (a) real human telephone speech, (b) genuinely call-centre-shaped (agent + customer turns, task-oriented), (c) richly labelled (gives us ground-truth transcripts to validate ASR accuracy), and (d) licence-clean. The labels double as a **transcription-accuracy test oracle** (compute WER of our ASR against their human transcript).
- **Direction caveat:** HVB calls are *inbound* service calls. For the outbound demo, seed metadata sets `direction = outbound` and tags `seed_source = harper_valley_bank` so it's never confused with real pilot data. The *audio characteristics the pipeline cares about are identical.*

### 6.2 Supplementary sources (small, optional)

- **Telephony sample WAVs** — a few 8 kHz mono WAVs from public, permissively-licensed repos (e.g. project sample-audio folders) to prove format/codec handling and the ffmpeg conversion branch on non-16k inputs.
- **`Analyzing-Customer-Support-Calls`** (`github.com/GabrielMazzotta/Analyzing-Customer-Support-Calls`) — has a sample customer-support WAV; useful as a second flavour. Verify its licence before redistribution; if unclear, fetch at seed time rather than vendoring into our repo.
- **`jim-schwoebel/voice_datasets`** — a curated index (95+ datasets) to mine later if more variety is needed. It's a *catalogue*, not audio — use as a discovery backlog.

> **Licensing rule for the seed module:** never vendor third-party audio into our repo. **Fetch at seed time** from the upstream GitHub repo, keep everything under `data/` (already gitignored), and write an `ATTRIBUTION.md`. This keeps our repo licence-clean and white-label-safe.

### 6.3 How the seed module works

`server/src/scripts/seedData.js`, wired to `npm run seed:data`:

1. **Fetch** a configurable subset (default `SEED_CALL_COUNT=12`) of HarperValleyBank calls. Pull the audio + the matching transcript/metadata JSON straight from the repo over HTTPS (raw GitHub or the repo's documented download). Cache into `data/seed/harper_valley_bank/` so re-runs are offline and idempotent.
2. **Ingest through the real path** — do **not** shortcut. Call the same `recordingIngestion`/`recordingStorage` services a human upload uses, so seeding exercises convert → hash → status exactly like production. Set metadata: `is_seed=1`, `seed_source`, `seed_external_id`, `direction='outbound'`, a synthetic `agent_name` spread across ~4 fictional agents (so dashboards/leaderboards have populated comparisons), random recent `call_datetime`s.
3. **Drive the pipeline** — enqueue the normal `convert → transcribe → analyze → coaching` chain. With the **mock** providers this completes fully offline; with real keys it uses them. The HVB human transcript is stored alongside as `seed_reference_transcript` for the optional WER check.
4. **Idempotency & cleanup** — dedup by content hash (existing behaviour); `npm run seed:data -- --reset` purges all `is_seed=1` rows + their files (hard delete — POPIA-clean) before re-seeding.

### 6.4 If "real outbound" is a hard requirement (fallbacks)

- **Synthetic-but-outbound:** generate N outbound sales calls with TTS from a handful of sales scripts (two voices = agent/customer), label `direction=outbound`, `seed_source=synthetic_tts`. Fully controllable, licence-free, genuinely outbound-shaped — but synthetic voices. Good for sales-criteria demos.
- **Commercial corpus:** AxonData / Macgence / Datamundi sell real call-centre audio with transcripts. Real and outbound-inclusive, but **paid and licence-gated** — not GitHub, and a cost line to justify against the demo's value.

### 6.5 Why this also de-risks the pilot

Same ingestion entry point means the pilot's real NDA'd outbound WAVs later drop in unchanged: only the `seed_source`/`is_seed` flags differ. Seeding is therefore both a **demo enabler now** and a **load/accuracy test harness** (real audio, known transcripts) before real client data ever touches the system.

### 6.6 Seed-module acceptance criteria

- **S1** `npm run seed:data` on a clean checkout, **offline, no API keys**, ends with ≥12 recordings at status `complete`, each with a transcript and a rendered Call Report (mock providers).
- **S2** Re-running `seed:data` adds no duplicates (hash dedup); `--reset` removes every `is_seed=1` row and its files, leaving non-seed data untouched.
- **S3** Seeded data is visibly flagged (`is_seed`/`seed_source`) and filterable out of "real" reporting; a single Admin purge clears it.
- **S4** With real ASR keys, an optional `npm run seed:verify` reports WER of our transcript vs the HVB human transcript per call (sanity check on transcription quality).
- **S5** `data/seed/ATTRIBUTION.md` exists and credits HarperValleyBank (CC-BY) and any other fetched source; no third-party audio is committed to the repo.

---

## 7. Verification & test plan (build is not done until these pass)

- **Unit (Vitest):** transcription/analysis **mock** providers; auth middleware (pending-gate 403, expired-token 401, refresh-once); **rubric scoring math** (weighted sum, weight=100 invariant, re-weight → score changes per PRD F5.5).
- **Integration:** one full-pipeline test using mock providers on a **seeded** HVB sample: upload-equivalent → convert → transcribe → analyze → report composite contains every element F4.1–F4.6.
- **Provider-swap test:** flipping `TRANSCRIPTION_PROVIDER`/`ANALYSIS_PROVIDER` (env or Settings) changes the provider with no code edit.
- **Manual demo script (the Friday-style run):** seed → log in as manager → Recordings all `complete` → open Call Report (audio seeks to clicked transcript segment) → export PDF → open Agent dashboard + leaderboard + coaching feed.
- **Security/compliance smoke:** upload type-sniff by magic bytes; range audio endpoint is path-traversal-safe; Admin purge hard-deletes seed rows+files (POPIA).

---

## 8. Open questions to resolve before/while building

1. **"Real" definition** — does the product owner accept real *inbound* role-play audio (HarperValleyBank) relabelled outbound for the pipeline demo, or must seed audio be genuinely outbound sales (→ synthetic TTS or paid corpus)? *(This is the §0 riskiest assumption.)*
2. **Default transcription provider for the demo** — Whisper self-hosted (free, your hardware) vs Azure `en-ZA` (best SA-accent accuracy, paid)? Mock covers offline either way.
3. **Seed volume** — 12 calls is enough to populate dashboards; do you want the fuller HVB subset (e.g. 100+) to make leaderboards look substantial?
4. **Agent identities in seed** — keep fictional free-text agent names, or pre-create seeded *agent user accounts* so the agent-role experience is demoable too?
```
