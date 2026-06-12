import { db } from "./connection.js";

export function insertRefreshToken({ userId, jtiHash, expiresAt }) {
  db.prepare(
    "INSERT INTO refresh_tokens (user_id, jti_hash, expires_at) VALUES (?, ?, ?)"
  ).run(userId, jtiHash, expiresAt);
}

export function findActiveRefreshToken(jtiHash) {
  return db
    .prepare(
      "SELECT * FROM refresh_tokens WHERE jti_hash = ? AND revoked_at IS NULL AND expires_at > datetime('now')"
    )
    .get(jtiHash);
}

export function revokeRefreshToken(jtiHash) {
  db.prepare(
    "UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE jti_hash = ? AND revoked_at IS NULL"
  ).run(jtiHash);
}

export function revokeAllUserRefreshTokens(userId) {
  db.prepare(
    "UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL"
  ).run(userId);
}

export function createPasswordResetToken({ userId, tokenHash, expiresAt, createdBy }) {
  db.prepare(
    "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_by) VALUES (?, ?, ?, ?)"
  ).run(userId, tokenHash, expiresAt, createdBy);
}

export function findValidPasswordResetToken(tokenHash) {
  return db
    .prepare(
      "SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')"
    )
    .get(tokenHash);
}

export function markPasswordResetTokenUsed(id) {
  db.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?").run(id);
}
