import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "insydout-phase1-"));
process.env.DB_FILE = path.join(tempRoot, "app.db");
process.env.APP_SECRET = "test-secret";
process.env.JWT_ACCESS_TTL_MINUTES = "15";
process.env.JWT_REFRESH_TTL_DAYS = "7";
process.env.NODE_ENV = "test";

const { createApp } = await import("../src/app.js");

function getSetCookie(headers) {
  const raw = headers.getSetCookie?.();
  if (raw && raw.length) {
    return raw;
  }
  const header = headers.get("set-cookie");
  return header ? [header] : [];
}

function extractRefreshCookie(setCookieHeaders) {
  const header = setCookieHeaders.find((value) => value.startsWith("refreshToken="));
  return header ? header.split(";")[0] : null;
}

async function jsonRequest(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body, setCookie: getSetCookie(response.headers) };
}

test("phase 1 auth, audit, and recordings integration", async () => {
  const app = createApp();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const registerAdmin = await jsonRequest(baseUrl, "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        firstName: "System",
        lastName: "Admin",
        email: "admin@example.com",
        password: "Passw0rd123",
        requestedRole: "admin"
      })
    });

    assert.equal(registerAdmin.response.status, 201);
    assert.equal(registerAdmin.body.user.role, "admin");
    assert.equal(registerAdmin.body.user.status, "active");

    const loginAdmin = await jsonRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "admin@example.com",
        password: "Passw0rd123"
      })
    });

    assert.equal(loginAdmin.response.status, 200);
    assert.ok(loginAdmin.body.accessToken);
    const adminRefreshCookie = extractRefreshCookie(loginAdmin.setCookie);
    assert.ok(adminRefreshCookie);

    const pendingUser = await jsonRequest(baseUrl, "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        firstName: "Pat",
        lastName: "Pending",
        email: "pending@example.com",
        password: "Passw0rd123",
        requestedRole: "agent"
      })
    });

    assert.equal(pendingUser.response.status, 201);
    assert.equal(pendingUser.body.user.status, "pending");

    const pendingLogin = await jsonRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "pending@example.com",
        password: "Passw0rd123"
      })
    });

    assert.equal(pendingLogin.response.status, 403);
    assert.equal(pendingLogin.body.error, "ACCOUNT_PENDING");

    const auditLogs = await jsonRequest(baseUrl, "/api/audit?limit=20", {
      headers: {
        Authorization: `Bearer ${loginAdmin.body.accessToken}`
      }
    });

    assert.equal(auditLogs.response.status, 200);
    assert.ok(Array.isArray(auditLogs.body.logs));
    assert.ok(auditLogs.body.logs.some((entry) => entry.action === "USER_BOOTSTRAP_ADMIN" || entry.action === "USER_REGISTERED"));

    const recordingCreate = await jsonRequest(baseUrl, "/api/recordings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${loginAdmin.body.accessToken}`
      },
      body: JSON.stringify({
        originalFilename: "call-001.wav",
        agentName: "Ayo Agent",
        direction: "outbound",
        callDatetime: "2026-06-11T10:00"
      })
    });

    assert.equal(recordingCreate.response.status, 201);
    assert.equal(recordingCreate.body.recording.status, "uploaded");

    const recordingList = await jsonRequest(baseUrl, "/api/recordings", {
      headers: {
        Authorization: `Bearer ${loginAdmin.body.accessToken}`
      }
    });

    assert.equal(recordingList.response.status, 200);
    assert.equal(recordingList.body.recordings.length, 1);
    assert.equal(recordingList.body.recordings[0].originalFilename, "call-001.wav");

    const recordingUpdate = await jsonRequest(baseUrl, `/api/recordings/${recordingCreate.body.recording.id}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${loginAdmin.body.accessToken}`
      },
      body: JSON.stringify({ status: "ready_for_transcription" })
    });

    assert.equal(recordingUpdate.response.status, 200);
    assert.equal(recordingUpdate.body.recording.status, "ready_for_transcription");

    const refresh = await jsonRequest(baseUrl, "/api/auth/refresh", {
      method: "POST",
      headers: {
        Cookie: adminRefreshCookie
      }
    });

    assert.equal(refresh.response.status, 200);
    assert.ok(refresh.body.accessToken);
  } finally {
    server.close();
  }
});
