import { db } from "./connection.js";

function mapUser(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    status: row.status,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    updatedAt: row.updated_at
  };
}

export function getUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
}

export function getUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function createUser({ email, passwordHash, firstName, lastName, role, status, approvedBy = null }) {
  const stmt = db.prepare(`
    INSERT INTO users (email, password_hash, first_name, last_name, role, status, approved_by, approved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END)
  `);
  const result = stmt.run(
    email.toLowerCase(),
    passwordHash,
    firstName,
    lastName,
    role,
    status,
    approvedBy,
    approvedBy
  );
  return getUserById(result.lastInsertRowid);
}

export function countUsers() {
  const row = db.prepare("SELECT COUNT(*) AS total FROM users").get();
  return row.total;
}

export function listUsers({ status, role }) {
  const where = [];
  const params = [];

  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  if (role) {
    where.push("role = ?");
    params.push(role);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM users ${whereClause} ORDER BY created_at DESC`)
    .all(...params);

  return rows.map(mapUser);
}

export function updateUserStatus({ userId, status, approvedBy = null, rejectionReason = null }) {
  db.prepare(`
    UPDATE users
    SET status = ?,
        approved_by = ?,
        approved_at = CASE WHEN ? IS NULL THEN approved_at ELSE datetime('now') END,
        rejection_reason = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(status, approvedBy, approvedBy, rejectionReason, userId);

  return getUserById(userId);
}

export function updateUserRole({ userId, role }) {
  db.prepare(
    "UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(role, userId);
  return getUserById(userId);
}

export function updateUserProfile({ userId, firstName, lastName }) {
  db.prepare(
    "UPDATE users SET first_name = ?, last_name = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(firstName, lastName, userId);
  return getUserById(userId);
}

export function updateUserPassword({ userId, passwordHash }) {
  db.prepare(
    "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(passwordHash, userId);
}

export function publicUser(row) {
  return mapUser(row);
}
