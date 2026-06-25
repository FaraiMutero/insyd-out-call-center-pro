/**
 * OpenAI-compatible analysis provider.
 * Works with any API that follows the OpenAI chat completions spec.
 * Explicitly supported via ANALYSIS_PROVIDER:
 *   deepseek          — uses DEEPSEEK_API_KEY + DEEPSEEK_MODEL (default: deepseek-chat)
 *   openai_compatible — uses OPENAI_COMPATIBLE_BASE_URL + OPENAI_COMPATIBLE_API_KEY + OPENAI_COMPATIBLE_MODEL
 *
 * The provider sends the full call transcript + rubric to the LLM and expects
 * a structured JSON scoring response.
 */

const PROVIDER_NAME = (process.env.ANALYSIS_PROVIDER || "openai_compatible").toLowerCase();

function getConfig() {
  if (PROVIDER_NAME === "deepseek") {
    return {
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      keyEnvVar: "DEEPSEEK_API_KEY",
    };
  }
  return {
    baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL,
    apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
    model: process.env.OPENAI_COMPATIBLE_MODEL || "gpt-4o-mini",
    keyEnvVar: "OPENAI_COMPATIBLE_API_KEY",
  };
}

const SYSTEM_PROMPT =
  "You are a senior call center QA analyst. Analyze the provided call transcript " +
  "against the scoring rubric and return ONLY a valid JSON object — no markdown, " +
  "no explanation, no text before or after the JSON.";

function buildPrompt({ recording, transcript, rubric }) {
  const criteriaList = rubric.criteria
    .map(c => `  { "id": "${c.id}", "name": "${c.name}", "maxScore": ${c.weight} }`)
    .join(",\n");

  return `CALL INFORMATION:
Direction: ${recording.direction || "unknown"}
Agent: ${recording.agentName || "unknown"}

TRANSCRIPT:
${transcript.fullText}

RUBRIC: "${rubric.title}"
Criteria (each scored 0 to maxScore):
[
${criteriaList}
]

Return a JSON object with EXACTLY this structure:
{
  "criteriaScores": [
    {
      "criterionId": "<matches id above>",
      "name": "<matches name above>",
      "score": <number 0–maxScore>,
      "maxScore": <number>,
      "pct": <integer 0–100>,
      "notes": "<one concise sentence explaining the score>"
    }
  ],
  "sentiment": "<positive|neutral|negative|mixed>",
  "outcome": "<sale_made|follow_up_agreed|callback_scheduled|not_interested|escalated|resolved|other>",
  "strengths": ["<strength>", "<strength>"],
  "improvements": ["<area>", "<area>", "<area>"],
  "errors": [],
  "summary": "<2–3 sentence overall assessment of the call>"
}

Rules:
- criteriaScores must include every criterion from the rubric, in the same order
- pct = Math.round((score / maxScore) * 100)
- strengths: 2–3 genuine positives observed in the transcript
- improvements: 2–4 specific coaching points
- errors: list only genuine compliance or process failures; leave empty array if none
- Base all observations on the actual transcript, not generic advice`;
}

export async function analyze(context) {
  const { baseUrl, apiKey, model, keyEnvVar } = getConfig();

  if (!apiKey) {
    throw new Error(`${keyEnvVar} is not set in .env`);
  }
  if (!baseUrl) {
    throw new Error("OPENAI_COMPATIBLE_BASE_URL is not set in .env");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(context) },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${PROVIDER_NAME} API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error(`Empty response from ${PROVIDER_NAME}`);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `${PROVIDER_NAME} did not return valid JSON. First 300 chars: ${raw.slice(0, 300)}`
    );
  }

  const criteriaScores = (parsed.criteriaScores || []).map(c => ({
    criterionId: String(c.criterionId || ""),
    name: String(c.name || ""),
    score: Number(c.score) || 0,
    maxScore: Number(c.maxScore) || 0,
    pct: Number(c.pct) || 0,
    notes: String(c.notes || ""),
  }));

  const overallScore = +(criteriaScores.reduce((s, c) => s + c.score, 0)).toFixed(1);

  return {
    provider: PROVIDER_NAME,
    overallScore,
    criteriaScores,
    sentiment: parsed.sentiment || "neutral",
    outcome: parsed.outcome || "other",
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
    errors: Array.isArray(parsed.errors) ? parsed.errors : [],
    summary: String(parsed.summary || ""),
  };
}
