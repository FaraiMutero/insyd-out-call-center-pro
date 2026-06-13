/**
 * Mock analysis provider — fully offline, deterministic output keyed to the recording filename.
 * Scores the call against the provided rubric criteria and generates coaching content.
 * Used in dev, CI, and demo mode (ANALYSIS_PROVIDER=mock or unset).
 */

const STRENGTHS_POOL = [
  "Strong opening — clearly identified themselves and the company.",
  "Effective use of open-ended discovery questions to understand customer needs.",
  "Handled price objection with a concrete value reframe.",
  "Secured a clear next step with a specific date and time.",
  "Maintained professional tone throughout, even when customer was resistant.",
  "Good use of social proof — referenced similar customers without fabricating.",
  "Concise and jargon-free product explanation.",
  "Confirmed customer understanding before moving to close.",
];

const IMPROVEMENTS_POOL = [
  "Needs to ask for permission before launching into the pitch.",
  "Could use more silence after asking a closing question — tendency to fill pauses.",
  "Product benefits were listed without being tied to specific customer needs.",
  "Talk/listen ratio was approximately 70:30 — aim for closer to 50:50 in discovery.",
  "Objection was acknowledged but not fully resolved before moving forward.",
  "Did not confirm email address before committing to send the quote.",
  "Closing language was tentative — use assumptive close phrases.",
];

const ERRORS_POOL = [
  "Disclosed premium estimate before completing needs assessment — reversed the sales process.",
  "Customer expressed uncertainty and agent moved to close without re-qualifying.",
  "Made a price commitment without checking product availability for the customer's area.",
  "Used jargon ('underwriting band') without explanation.",
];

const OUTCOMES = [
  "follow_up_agreed",
  "sale_made",
  "callback_scheduled",
  "not_interested",
  "follow_up_agreed",
  "follow_up_agreed",
  "sale_made",
  "callback_scheduled",
];

const SENTIMENTS = ["positive", "positive", "neutral", "negative", "mixed", "positive"];

function seedHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function pickN(pool, n, seed) {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = ((seed * (i + 1)) >>> 0) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

export async function analyze({ recording, transcript, rubric }) {
  const seed = seedHash(recording.originalFilename || String(recording.id));

  const criteriaScores = rubric.criteria.map((criterion, i) => {
    const h = seedHash(`${recording.originalFilename}_${criterion.id}_${i}`);
    const pct = 0.45 + ((h % 56) / 100);
    const score = +(criterion.weight * pct).toFixed(1);
    return {
      criterionId: criterion.id,
      name: criterion.name,
      score,
      maxScore: criterion.weight,
      pct: +(pct * 100).toFixed(0),
      notes: pct > 0.75
        ? "Handled confidently."
        : pct > 0.55
          ? "Adequate — room to sharpen."
          : "Needs attention in coaching.",
    };
  });

  const overallScore = +(criteriaScores.reduce((s, c) => s + c.score, 0)).toFixed(1);

  return {
    provider: "mock",
    overallScore,
    criteriaScores,
    sentiment: SENTIMENTS[seed % SENTIMENTS.length],
    outcome: OUTCOMES[seed % OUTCOMES.length],
    strengths: pickN(STRENGTHS_POOL, 2, seed),
    improvements: pickN(IMPROVEMENTS_POOL, 2, (seed >> 2)),
    errors: seed % 3 === 0 ? pickN(ERRORS_POOL, 1, (seed >> 4)) : [],
    summary: `The agent demonstrated competent execution across most rubric criteria, achieving a score of ${overallScore}/100. Key opportunities for improvement centre on discovery depth and closing technique.`,
  };
}
