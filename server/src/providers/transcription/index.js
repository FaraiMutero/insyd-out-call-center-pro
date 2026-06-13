/**
 * Transcription provider factory.
 * Reads TRANSCRIPTION_PROVIDER env var (or DB settings in future) and returns the right provider.
 * Supported values: mock (default), whisper, azure
 */

import { transcribe as mockTranscribe } from "./mock.js";

const PROVIDER = (process.env.TRANSCRIPTION_PROVIDER || "mock").toLowerCase();

export async function transcribe(recording) {
  if (PROVIDER === "mock") {
    return mockTranscribe(recording);
  }

  // Phase C: real providers loaded lazily so missing deps don't break mock-only installs
  if (PROVIDER === "whisper") {
    const { transcribe: whisperTranscribe } = await import("./whisper.js");
    return whisperTranscribe(recording);
  }

  if (PROVIDER === "azure") {
    const { transcribe: azureTranscribe } = await import("./azure.js");
    return azureTranscribe(recording);
  }

  throw new Error(`Unknown TRANSCRIPTION_PROVIDER: ${PROVIDER}`);
}
