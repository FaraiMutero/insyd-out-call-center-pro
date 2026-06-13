#!/usr/bin/env bash
# agent-fix.sh — the "lights-out" half of the kit.
# Reads qa-report/ux-issues.json + Lighthouse output, hands them to Claude Code
# in headless mode, lets it fix the code, then opens a PR for your review.
#
# Requirements on the runner: claude (Claude Code CLI), gh (GitHub CLI), git, jq, node.
# Run AFTER the test suite has produced qa-report/.
set -euo pipefail

ISSUES_FILE="qa-report/ux-issues.json"
LH_DIR="qa-report/lighthouse"
BRANCH="qa-agent/fixes-$(date +%Y%m%d-%H%M)"
MAX_TURNS="${MAX_TURNS:-40}"

# Nothing to do? Exit clean — keeps the pipeline green.
if [[ ! -s "$ISSUES_FILE" ]] || [[ "$(jq 'length' "$ISSUES_FILE")" == "0" ]]; then
  if ! ls "$LH_DIR"/assertion-results.json >/dev/null 2>&1; then
    echo "No UX issues and no Lighthouse failures. Nothing to fix."
    exit 0
  fi
fi

git checkout -b "$BRANCH"

# Build the prompt from real audit output — the agent fixes observed issues,
# it does not go hunting for hypothetical ones.
PROMPT=$(cat <<'EOF'
You are an automated front-end QA fixer working in this repository.

Below are issues found by an automated audit (Playwright UX smoke tests + Lighthouse).
Fix ONLY these issues. Rules:
- Smallest possible diff per issue. No refactors, no dependency upgrades, no style-only churn.
- For a11y issues: fix the markup/ARIA, do not suppress the rule.
- For performance issues: prefer next/image, dynamic imports, font-display, and removing
  unused JS over config tricks.
- For console errors: fix the root cause if it is in this repo; if it is third-party, add it
  to ignoreConsolePatterns in qa.config.json and note why.
- After fixing, run `npx playwright test` and ensure it passes before finishing.
- If an issue cannot be fixed safely, skip it and list it in SKIPPED.md with a one-line reason.

AUDIT RESULTS:
EOF
)
PROMPT+=$'\n\n--- UX issues ---\n'
PROMPT+=$(cat "$ISSUES_FILE" 2>/dev/null || echo "none")
if compgen -G "$LH_DIR/assertion-results.json" >/dev/null 2>&1; then
  PROMPT+=$'\n\n--- Lighthouse assertion failures ---\n'
  PROMPT+=$(jq '[.[] | select(.passed == false) | {auditId, url, expected, actual: .actualValue}]' "$LH_DIR"/assertion-results.json)
fi

# Headless agent run. --permission-mode acceptEdits lets it edit files but the
# human gate is the PR review, not the edit step.
claude -p "$PROMPT" \
  --permission-mode acceptEdits \
  --max-turns "$MAX_TURNS" \
  --output-format text

# No changes? Bail without opening an empty PR.
if git diff --quiet && git diff --cached --quiet; then
  echo "Agent made no changes."
  git checkout - && git branch -D "$BRANCH"
  exit 0
fi

git add -A
git commit -m "fix(qa-agent): automated UX/performance fixes from audit $(date +%Y-%m-%d)"
git push -u origin "$BRANCH"

gh pr create \
  --title "QA agent: UX & performance fixes ($(date +%Y-%m-%d))" \
  --body "$(cat <<EOF
Automated fixes generated from the QA audit. **Review before merging.**

## Issues addressed
\`\`\`json
$(jq -c '.[:10]' "$ISSUES_FILE" 2>/dev/null || echo "[]")
\`\`\`

Full report: see \`qa-report/\` artifact on the triggering CI run.
EOF
)"

echo "PR opened on branch $BRANCH"
