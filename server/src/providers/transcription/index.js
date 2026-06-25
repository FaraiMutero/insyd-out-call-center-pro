/**
 * Transcription provider factory.
 * Reads TRANSCRIPTION_PROVIDER env var (or DB settings in future) and returns the right provider.
 * Supported values: whisper, azure
 *
 * Resolution is intentionally lazy (per-call, via getTranscriptionProviderName()) rather than
 * frozen at import time — see config/providerConfig.js for why an unset env var must never
 * silently resolve to a default.
 */

import { getTranscriptionProviderName } from "../../config/providerConfig.js";

export async function transcribe(recording) {
  const provider = getTranscriptionProviderName();

  if (!provider) {
    throw new Error(
      "TRANSCRIPTION_PROVIDER is not set. There is no fallback — " +
      "set TRANSCRIPTION_PROVIDER explicitly in .env."
    );
  }

  // Real providers loaded lazily so a missing dep for one doesn't break the others
  if (provider === "whisper") {
    const { transcribe: whisperTranscribe } = await import("./whisper.js");
    return whisperTranscribe(recording);
  }

  if (provider === "azure") {
    const { transcribe: azureTranscribe } = await import("./azure.js");
    return azureTranscribe(recording);
  }

  throw new Error(`Unknown TRANSCRIPTION_PROVIDER: ${provider}`);
}
