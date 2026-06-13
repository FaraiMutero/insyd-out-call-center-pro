# Frontend QA Kit

Drop-in, config-driven QA layer for any Next.js/React client app. One kit, every repo — only `qa.config.json` and the Lighthouse URLs change per app.

## How it works

```
            ┌─────────────────────────────────────────────┐
 PR / cron  │  self-hosted runner (your hardware)         │
 ──────────▶│                                             │
            │  1. build app                               │
            │  2. Playwright UX smoke ──▶ ux-issues.json  │
            │     (console errors, axe a11y, overflow,    │
            │      broken images, dead links)             │
            │  3. Lighthouse CI ──▶ budget assertions     │
            │     (LCP, CLS, TBT, FCP, bundle weight)     │
            │  4. nightly only: agent-fix.sh              │
            │     audit output ──▶ Claude Code headless   │
            │     ──▶ minimal diffs ──▶ PR for review     │
            └─────────────────────────────────────────────┘
```

Two loops, one human gate:

- **Detection loop** (every PR): tests fail the build, report uploaded as artifact. Cost: ~R0 — runs on your machine.
- **Fix loop** (nightly): the agent only sees *observed* failures, fixes with smallest-possible diffs, re-runs the suite, opens a PR. You review and merge. Cost: API tokens per nightly run with failures (typically a few rand; zero on clean nights — script exits early).

## Setup (per app, ~5 min)

1. Copy this folder's contents into the app repo root.
2. Edit `qa.config.json` — set routes and console-noise ignore patterns.
3. Edit `lighthouserc.json` — set the URLs to audit.
4. `npm i -D @playwright/test @axe-core/playwright @lhci/cli && npx playwright install chromium`
5. Runner needs: `claude` CLI (logged in or `ANTHROPIC_API_KEY`), `gh` CLI, `jq`.
6. Sanity check locally: `npm run qa`, then `npm run qa:fix` to watch the agent work once before trusting cron.

## Tuning the budgets

`lighthouserc.json` ships with sane defaults (perf ≥ 0.85, LCP ≤ 3s, CLS ≤ 0.1). For a client paying for "fast", tighten to perf ≥ 0.9 / LCP ≤ 2.5s and put those numbers in the proposal — measurable budgets are a sellable SLA line item.

## White-label notes

- No Kenite naming anywhere in this kit — safe to commit to client-facing repos as-is.
- Agent commits use the repo's configured git identity; set per-repo `git config user.name/email` to the reseller's bot identity.
- The PR body references only the audit, never the tooling vendor.

## Upgrade path (when you want more)

1. **Visual regression**: add `expect(page).toHaveScreenshot()` per route — catches CSS regressions the heuristics miss. Free, but maintain baseline images.
2. **Real-user perf**: budgets here are lab numbers. Add a self-hosted [Unlighthouse](https://unlighthouse.dev) or Plausible + web-vitals beacon for field data.
3. **Autonomy dial-up**: once you trust the agent's PRs (track its merge rate for a month), let CI auto-merge when the full suite + visual diff pass. That's the lights-out end state.
4. **Fleet mode**: run the nightly across all client repos from one script; pipe each PR link into your status-report automation.

## Riskiest assumption

That lab Lighthouse numbers on your runner predict client-perceived performance. They direct *relative* regressions well, but absolute numbers shift with hardware and network shaping. Don't quote the raw scores to a reseller as user-experience guarantees until you've added field data (upgrade path #2).
