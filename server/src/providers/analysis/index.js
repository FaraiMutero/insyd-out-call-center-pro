/**
 * Analysis provider factory.
 * Reads ANALYSIS_PROVIDER env var (or DB settings in future) and returns the right provider.
 * Supported values: mock (default), anthropic, openai_compatible
 */

import { analyze as mockAnalyze } from "./mock.js";

const PROVIDER = (process.env.ANALYSIS_PROVIDER || "mock").toLowerCase();

export async function analyze(context) {
  if (PROVIDER === "mock") {
    return mockAnalyze(context);
  }

  if (PROVIDER === "anthropic") {
    const { analyze: anthropicAnalyze } = await import("./anthropic.js");
    return anthropicAnalyze(context);
  }

  if (PROVIDER === "openai_compatible") {
    const { analyze: openaiAnalyze } = await import("./openaiCompatible.js");
    return openaiAnalyze(context);
  }

  throw new Error(`Unknown ANALYSIS_PROVIDER: ${PROVIDER}`);
}
