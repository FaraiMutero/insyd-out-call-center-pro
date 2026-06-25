/**
 * Analysis provider factory.
 * Reads ANALYSIS_PROVIDER env var (or DB settings in future) and returns the right provider.
 * Supported values: anthropic, openai_compatible, deepseek
 *
 * Resolution is intentionally lazy (per-call, via getAnalysisProviderName()) rather than
 * frozen at import time — see config/providerConfig.js for why an unset env var must never
 * silently resolve to a default.
 */

import { getAnalysisProviderName } from "../../config/providerConfig.js";

export async function analyze(context) {
  const provider = getAnalysisProviderName();

  if (!provider) {
    throw new Error(
      "ANALYSIS_PROVIDER is not set. There is no fallback — " +
      "set ANALYSIS_PROVIDER explicitly in .env."
    );
  }

  if (provider === "anthropic") {
    const { analyze: anthropicAnalyze } = await import("./anthropic.js");
    return anthropicAnalyze(context);
  }

  if (provider === "openai_compatible" || provider === "deepseek") {
    const { analyze: openaiAnalyze } = await import("./openaiCompatible.js");
    return openaiAnalyze(context);
  }

  throw new Error(`Unknown ANALYSIS_PROVIDER: ${provider}`);
}
