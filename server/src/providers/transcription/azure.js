/**
 * Azure Speech Services transcription provider.
 * Uses the Fast Transcription REST API — synchronous, no blob storage required,
 * supports diarization for up to 2 hours of audio.
 * https://learn.microsoft.com/azure/ai-services/speech-service/fast-transcription-create
 *
 * Required env vars:
 *   AZURE_SPEECH_KEY     — your Azure Speech resource key
 *   AZURE_SPEECH_REGION  — e.g. eastus
 * Optional:
 *   AZURE_SPEECH_LANGUAGE — BCP-47 locale, default en-US
 */

import fs from "node:fs";
import path from "node:path";

const KEY = process.env.AZURE_SPEECH_KEY;
const REGION = process.env.AZURE_SPEECH_REGION;
const LANGUAGE = process.env.AZURE_SPEECH_LANGUAGE || "en-US";

function apiUrl(region) {
  return `https://${region}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15`;
}

/**
 * Determine which Azure speaker ID maps to AGENT vs CUSTOMER.
 * In outbound calls the agent speaks first; in inbound the customer does.
 */
function buildSpeakerMap(phrases, direction) {
  const firstSpeaker = phrases.find(p => p.speaker != null)?.speaker ?? 1;
  const secondSpeaker = phrases.find(p => p.speaker != null && p.speaker !== firstSpeaker)?.speaker ?? (firstSpeaker === 1 ? 2 : 1);

  if (direction === "inbound") {
    return { [firstSpeaker]: "CUSTOMER", [secondSpeaker]: "AGENT" };
  }
  return { [firstSpeaker]: "AGENT", [secondSpeaker]: "CUSTOMER" };
}

export async function transcribe(recording) {
  if (!KEY || !REGION) {
    throw new Error("AZURE_SPEECH_KEY and AZURE_SPEECH_REGION must be set in .env");
  }

  const audioPath = recording.storedPath;
  if (!audioPath || !fs.existsSync(audioPath)) {
    throw new Error(`Converted audio file not found at: ${audioPath}`);
  }

  const audioBuffer = fs.readFileSync(audioPath);

  const formData = new FormData();
  formData.append(
    "audio",
    new Blob([audioBuffer], { type: "audio/wav" }),
    path.basename(audioPath)
  );
  formData.append(
    "definition",
    JSON.stringify({
      locales: [LANGUAGE],
      diarizationSettings: { minSpeakerCount: 2, maxSpeakerCount: 2 },
      profanityFilterMode: "None",
    })
  );

  const response = await fetch(apiUrl(REGION), {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": KEY },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Azure Speech API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  const phrases = data.phrases || [];

  if (!phrases.length) {
    return {
      provider: "azure",
      language: LANGUAGE,
      fullText: "",
      segments: [],
    };
  }

  const speakerMap = buildSpeakerMap(phrases, recording.direction);

  const segments = phrases.map((phrase, i) => {
    const speakerLabel = speakerMap[phrase.speaker] ?? `SPEAKER_${phrase.speaker ?? "?"}`;
    return {
      id: i + 1,
      speaker: speakerLabel,
      start: +(phrase.offsetMilliseconds / 1000).toFixed(2),
      end: +((phrase.offsetMilliseconds + phrase.durationMilliseconds) / 1000).toFixed(2),
      text: phrase.text,
    };
  });

  const fullText = segments.map(s => `[${s.speaker}]: ${s.text}`).join("\n");

  return {
    provider: "azure",
    language: LANGUAGE,
    fullText,
    segments,
  };
}
