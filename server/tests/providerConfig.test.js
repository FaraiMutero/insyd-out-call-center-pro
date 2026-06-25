import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateProviderConfig } from "../src/config/providerConfig.js";

/**
 * Regression coverage for: server started without --env-file silently treated
 * unset TRANSCRIPTION_PROVIDER / ANALYSIS_PROVIDER as a default with no error
 * anywhere, so calls got "analyzed" against the wrong provider with zero signal
 * that anything was wrong.
 *
 * Rule under test: in every mode, with no exceptions, these vars must be
 * explicitly set. Unset must throw, not silently degrade — there is no
 * environment that gets an implicit default.
 */

function setEnv(overrides) {
  const keys = Object.keys(overrides);
  const previous = {};
  for (const key of keys) previous[key] = process.env[key];
  for (const key of keys) {
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  return () => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  };
}

/* ── Unit coverage: validateProviderConfig() is a pure function, safe to
   exercise directly with mutated process.env — no module-caching concerns. ── */

for (const nodeEnv of ["development", "production", "test", undefined]) {
  test(`validateProviderConfig: throws when both providers are unset (NODE_ENV=${nodeEnv})`, () => {
    const restore = setEnv({ NODE_ENV: nodeEnv, TRANSCRIPTION_PROVIDER: undefined, ANALYSIS_PROVIDER: undefined });
    try {
      assert.throws(
        () => validateProviderConfig(),
        /TRANSCRIPTION_PROVIDER.*ANALYSIS_PROVIDER|ANALYSIS_PROVIDER.*TRANSCRIPTION_PROVIDER/s
      );
    } finally {
      restore();
    }
  });
}

test("validateProviderConfig: throws when only one provider is unset", () => {
  const restore = setEnv({ NODE_ENV: "production", TRANSCRIPTION_PROVIDER: "azure", ANALYSIS_PROVIDER: undefined });
  try {
    assert.throws(() => validateProviderConfig(), /ANALYSIS_PROVIDER/);
  } finally {
    restore();
  }
});

test("validateProviderConfig: respects explicit non-mock providers", () => {
  const restore = setEnv({ NODE_ENV: "production", TRANSCRIPTION_PROVIDER: "azure", ANALYSIS_PROVIDER: "openai_compatible" });
  try {
    const result = validateProviderConfig();
    assert.equal(result.transcription, "azure");
    assert.equal(result.analysis, "openai_compatible");
  } finally {
    restore();
  }
});

test("validateProviderConfig: test mode gets no special treatment — unset still throws", () => {
  const restore = setEnv({ NODE_ENV: "test", TRANSCRIPTION_PROVIDER: undefined, ANALYSIS_PROVIDER: undefined });
  try {
    assert.throws(() => validateProviderConfig(), /TRANSCRIPTION_PROVIDER/);
  } finally {
    restore();
  }
});

/* ── API-level coverage ──────────────────────────────────────────────────
   Boots the real Express app (createApp()) and hits /api/health over actual
   HTTP, proving configured env values reach the running server — not just
   the validator in isolation. DB_FILE must be fixed before the first import
   of app.js, since db/connection.js opens its DatabaseSync at module load
   time (singleton for the lifetime of this process). */

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "insydout-providercfg-"));
process.env.DB_FILE = path.join(tempRoot, "app.db");
process.env.APP_SECRET = "test-secret";
process.env.JWT_ACCESS_TTL_MINUTES = "15";
process.env.JWT_REFRESH_TTL_DAYS = "7";
process.env.NODE_ENV = "test";
process.env.TRANSCRIPTION_PROVIDER = "azure";
process.env.ANALYSIS_PROVIDER = "anthropic";

const { createApp } = await import("../src/app.js");

test("API: /api/health reports explicitly configured providers", async () => {
  const restore = setEnv({ TRANSCRIPTION_PROVIDER: "azure", ANALYSIS_PROVIDER: "openai_compatible" });
  let server;
  try {
    const app = createApp();
    server = app.listen(0);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.providers.transcription, "azure");
    assert.equal(body.providers.analysis, "openai_compatible");
  } finally {
    server?.close();
    restore();
  }
});

test("API: server refuses to start when provider env vars are unset", () => {
  const restore = setEnv({ NODE_ENV: "production", TRANSCRIPTION_PROVIDER: undefined, ANALYSIS_PROVIDER: undefined });
  try {
    assert.throws(() => createApp(), /TRANSCRIPTION_PROVIDER|ANALYSIS_PROVIDER/);
  } finally {
    restore();
  }
});

test("API: server refuses to start when unset even in test mode — no carve-out", () => {
  const restore = setEnv({ NODE_ENV: "test", TRANSCRIPTION_PROVIDER: undefined, ANALYSIS_PROVIDER: undefined });
  try {
    assert.throws(() => createApp(), /TRANSCRIPTION_PROVIDER|ANALYSIS_PROVIDER/);
  } finally {
    restore();
  }
});
