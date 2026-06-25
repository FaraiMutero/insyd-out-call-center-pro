/**
 * Central source of truth for which transcription/analysis providers are active.
 *
 * Root cause this guards against: if the server starts without its .env loaded
 * (e.g. missing --env-file flag), process.env.TRANSCRIPTION_PROVIDER / .ANALYSIS_PROVIDER
 * are undefined, and a naive `process.env.X || "<default>"` silently falls back to some
 * default — meaning calls get "analyzed" with no error anywhere.
 *
 * Rule: there is no fallback, ever, in any mode. TRANSCRIPTION_PROVIDER and
 * ANALYSIS_PROVIDER must always be explicitly present in .env (see .env.example
 * for supported values). If they're missing, fail loudly at startup instead of
 * silently running against an unintended provider.
 */

export function getTranscriptionProviderName() {
  const value = process.env.TRANSCRIPTION_PROVIDER;
  return value ? value.toLowerCase() : null;
}

export function getAnalysisProviderName() {
  const value = process.env.ANALYSIS_PROVIDER;
  return value ? value.toLowerCase() : null;
}

export function validateProviderConfig() {
  const transcription = getTranscriptionProviderName();
  const analysis = getAnalysisProviderName();

  const missing = [];
  if (!transcription) missing.push("TRANSCRIPTION_PROVIDER");
  if (!analysis) missing.push("ANALYSIS_PROVIDER");

  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
      `There is no fallback — set these explicitly in .env and make sure the ` +
      `process is started with --env-file (see server/package.json scripts).`
    );
  }

  return { transcription, analysis };
}
