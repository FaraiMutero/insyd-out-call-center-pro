import bcrypt from "bcryptjs";
import { randomToken, sha256 } from "../auth/crypto.js";
import { REFRESH_TOKEN_MS, signAccessToken, signRefreshToken, verifyToken } from "../auth/jwt.js";
import {
  createPasswordResetToken,
  findActiveRefreshToken,
  findValidPasswordResetToken,
  insertRefreshToken,
  markPasswordResetTokenUsed,
  revokeAllUserRefreshTokens,
  revokeRefreshToken
} from "../db/tokensRepository.js";
import {
  countUsers,
  createUser,
  getUserByEmail,
  getUserById,
  publicUser,
  updateUserPassword,
  updateUserProfile,
  updateUserRole,
  updateUserStatus
} from "../db/usersRepository.js";
import { writeAudit } from "../db/auditRepository.js";

const SALT_ROUNDS = 12;
const allowedRoles = ["admin", "manager", "qa", "agent"];

function validateRegistration({ email, password, firstName, lastName, requestedRole }) {
  const role = requestedRole || "agent";
  if (!email || !String(email).includes("@")) {
    return "Invalid email address";
  }
  if (!password || password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must be at least 10 chars and include letters and digits";
  }
  if (!firstName || !lastName) {
    return "First name and last name are required";
  }
  if (!allowedRoles.includes(role)) {
    return "Invalid role";
  }
  return null;
}

function createTokenPair(user) {
  const jti = randomToken(24);
  const refreshToken = signRefreshToken({ userId: user.id, jti });
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MS).toISOString();
  insertRefreshToken({ userId: user.id, jtiHash: sha256(jti), expiresAt });

  return {
    accessToken: signAccessToken(user),
    refreshToken,
    user: publicUser(user)
  };
}

export async function register(input) {
  const error = validateRegistration(input);
  if (error) {
    return { status: 400, body: { error: "VALIDATION_ERROR", message: error } };
  }

  if (getUserByEmail(input.email)) {
    return {
      status: 409,
      body: { error: "EMAIL_EXISTS", message: "An account with this email already exists" }
    };
  }

  const totalUsers = countUsers();
  const isBootstrapUser = totalUsers === 0;
  const role = isBootstrapUser ? "admin" : input.requestedRole || "agent";
  const status = isBootstrapUser ? "active" : "pending";

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = createUser({
    email: input.email,
    passwordHash,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    role,
    status,
    approvedBy: null
  });

  writeAudit({
    userId: user.id,
    action: "USER_REGISTERED",
    entity: "user",
    entityId: String(user.id),
    detail: { status: user.status, role: user.role, bootstrap: isBootstrapUser }
  });

  return {
    status: 201,
    body: {
      user: publicUser(user),
      message: isBootstrapUser
        ? "Bootstrap admin account created and activated"
        : "Account created and pending admin approval"
    }
  };
}

export async function createAgentByAdmin({ actorUserId, email, password, firstName, lastName, role = "agent" }) {
  const error = validateRegistration({ email, password, firstName, lastName, requestedRole: role });
  if (error) {
    return { status: 400, body: { error: "VALIDATION_ERROR", message: error } };
  }

  if (getUserByEmail(email)) {
    return {
      status: 409,
      body: { error: "EMAIL_EXISTS", message: "An account with this email already exists" }
    };
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = createUser({
    email,
    passwordHash,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    role,
    status: "active",
    approvedBy: actorUserId
  });

  writeAudit({
    userId: actorUserId,
    action: "AGENT_CREATED",
    entity: "user",
    entityId: String(user.id),
    detail: { role }
  });

  return { status: 201, body: { user: publicUser(user) } };
}

export async function login({ email, password }) {
  const user = getUserByEmail(email || "");
  if (!user) {
    return { status: 401, body: { error: "INVALID_CREDENTIALS" } };
  }

  const valid = await bcrypt.compare(password || "", user.password_hash);
  if (!valid) {
    return { status: 401, body: { error: "INVALID_CREDENTIALS" } };
  }

  if (user.status === "pending") {
    return {
      status: 403,
      body: { error: "ACCOUNT_PENDING", message: "Your account is awaiting admin approval" }
    };
  }

  if (user.status !== "active") {
    return {
      status: 403,
      body: { error: "ACCOUNT_INACTIVE", message: "Your account is not active" }
    };
  }

  const tokenPair = createTokenPair(user);
  writeAudit({ userId: user.id, action: "USER_LOGGED_IN", entity: "user", entityId: String(user.id) });

  return { status: 200, body: tokenPair };
}

export function refreshSession(refreshTokenJwt) {
  if (!refreshTokenJwt) {
    return { status: 401, body: { error: "INVALID_REFRESH_TOKEN" } };
  }

  try {
    const payload = verifyToken(refreshTokenJwt);
    if (payload.typ !== "refresh" || !payload.jti) {
      return { status: 401, body: { error: "INVALID_REFRESH_TOKEN" } };
    }

    const tokenRow = findActiveRefreshToken(sha256(payload.jti));
    if (!tokenRow) {
      return { status: 401, body: { error: "INVALID_REFRESH_TOKEN" } };
    }

    const user = getUserById(Number(payload.sub));
    if (!user || user.status !== "active") {
      return { status: 403, body: { error: "ACCOUNT_INACTIVE" } };
    }

    revokeRefreshToken(sha256(payload.jti));

    const tokenPair = createTokenPair(user);
    writeAudit({ userId: user.id, action: "SESSION_REFRESHED", entity: "user", entityId: String(user.id) });

    return { status: 200, body: tokenPair };
  } catch {
    return { status: 401, body: { error: "INVALID_REFRESH_TOKEN" } };
  }
}

export function logout(refreshTokenJwt) {
  if (!refreshTokenJwt) {
    return;
  }

  try {
    const payload = verifyToken(refreshTokenJwt);
    if (payload.jti) {
      revokeRefreshToken(sha256(payload.jti));
      writeAudit({ userId: Number(payload.sub), action: "USER_LOGGED_OUT", entity: "user", entityId: String(payload.sub) });
    }
  } catch {
    // Token may already be expired or invalid.
  }
}

export function getAuthStatus(userId) {
  const user = getUserById(userId);
  if (!user) {
    return null;
  }
  return publicUser(user);
}

export function approveUser({ actorUserId, userId, role }) {
  const user = getUserById(userId);
  if (!user) {
    return { status: 404, body: { error: "USER_NOT_FOUND" } };
  }

  const nextRole = role || user.role;
  if (!allowedRoles.includes(nextRole)) {
    return { status: 400, body: { error: "INVALID_ROLE" } };
  }

  updateUserRole({ userId, role: nextRole });
  const updated = updateUserStatus({ userId, status: "active", approvedBy: actorUserId });

  writeAudit({
    userId: actorUserId,
    action: "USER_APPROVED",
    entity: "user",
    entityId: String(userId),
    detail: { role: nextRole }
  });

  return { status: 200, body: { user: publicUser(updated) } };
}

export function rejectUser({ actorUserId, userId, reason }) {
  const user = getUserById(userId);
  if (!user) {
    return { status: 404, body: { error: "USER_NOT_FOUND" } };
  }
  const updated = updateUserStatus({
    userId,
    status: "rejected",
    approvedBy: actorUserId,
    rejectionReason: reason || "Rejected by admin"
  });

  writeAudit({
    userId: actorUserId,
    action: "USER_REJECTED",
    entity: "user",
    entityId: String(userId),
    detail: { reason: updated.rejectionReason }
  });

  return { status: 200, body: { user: publicUser(updated) } };
}

export function deactivateUser({ actorUserId, userId }) {
  const user = getUserById(userId);
  if (!user) {
    return { status: 404, body: { error: "USER_NOT_FOUND" } };
  }
  const updated = updateUserStatus({ userId, status: "deactivated" });
  revokeAllUserRefreshTokens(userId);

  writeAudit({ userId: actorUserId, action: "USER_DEACTIVATED", entity: "user", entityId: String(userId) });

  return { status: 200, body: { user: publicUser(updated) } };
}

export function reactivateUser({ actorUserId, userId }) {
  const user = getUserById(userId);
  if (!user) {
    return { status: 404, body: { error: "USER_NOT_FOUND" } };
  }
  const updated = updateUserStatus({ userId, status: "active", approvedBy: actorUserId });

  writeAudit({ userId: actorUserId, action: "USER_REACTIVATED", entity: "user", entityId: String(userId) });

  return { status: 200, body: { user: publicUser(updated) } };
}

export async function updateProfile({ userId, firstName, lastName }) {
  if (!firstName || !lastName) {
    return { status: 400, body: { error: "VALIDATION_ERROR", message: "First and last name are required" } };
  }
  const updated = updateUserProfile({ userId, firstName, lastName });
  writeAudit({ userId, action: "PROFILE_UPDATED", entity: "user", entityId: String(userId) });
  return { status: 200, body: { user: publicUser(updated) } };
}

export async function changePassword({ userId, currentPassword, newPassword }) {
  if (!newPassword || newPassword.length < 10 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return {
      status: 400,
      body: {
        error: "VALIDATION_ERROR",
        message: "Password must be at least 10 chars and include letters and digits"
      }
    };
  }

  const user = getUserById(userId);
  const valid = await bcrypt.compare(currentPassword || "", user.password_hash);
  if (!valid) {
    return { status: 401, body: { error: "INVALID_CREDENTIALS", message: "Current password is incorrect" } };
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  updateUserPassword({ userId, passwordHash });
  revokeAllUserRefreshTokens(userId);

  writeAudit({ userId, action: "PASSWORD_CHANGED", entity: "user", entityId: String(userId) });

  return { status: 200, body: { message: "Password changed" } };
}

export function createResetLink({ actorUserId, targetUserId }) {
  const user = getUserById(targetUserId);
  if (!user) {
    return { status: 404, body: { error: "USER_NOT_FOUND" } };
  }

  const rawToken = randomToken(24);
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  createPasswordResetToken({ userId: targetUserId, tokenHash, expiresAt, createdBy: actorUserId });
  writeAudit({ userId: actorUserId, action: "PASSWORD_RESET_LINK_CREATED", entity: "user", entityId: String(targetUserId) });

  return {
    status: 200,
    body: {
      resetLink: `/reset-password?token=${rawToken}`,
      expiresAt
    }
  };
}

export async function resetPassword({ token, newPassword }) {
  if (!token) {
    return { status: 400, body: { error: "INVALID_RESET_TOKEN" } };
  }
  if (!newPassword || newPassword.length < 10 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return {
      status: 400,
      body: {
        error: "VALIDATION_ERROR",
        message: "Password must be at least 10 chars and include letters and digits"
      }
    };
  }

  const tokenRow = findValidPasswordResetToken(sha256(token));
  if (!tokenRow) {
    return { status: 400, body: { error: "INVALID_RESET_TOKEN" } };
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  updateUserPassword({ userId: tokenRow.user_id, passwordHash });
  markPasswordResetTokenUsed(tokenRow.id);
  revokeAllUserRefreshTokens(tokenRow.user_id);

  writeAudit({ userId: tokenRow.user_id, action: "PASSWORD_RESET_COMPLETED", entity: "user", entityId: String(tokenRow.user_id) });

  return { status: 200, body: { message: "Password reset successful" } };
}
