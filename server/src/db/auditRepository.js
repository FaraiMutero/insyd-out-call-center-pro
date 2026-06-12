import { db } from "./connection.js";

export function writeAudit({ userId = null, action, entity, entityId = null, detail = null }) {
  db.prepare(
    "INSERT INTO audit_log (user_id, action, entity, entity_id, detail_json) VALUES (?, ?, ?, ?, ?)"
  ).run(userId, action, entity, entityId, detail ? JSON.stringify(detail) : null);
}

export function listAuditLogs({ limit = 100, offset = 0 } = {}) {
  return db
    .prepare(
      `SELECT a.id,
              a.user_id,
              a.action,
              a.entity,
              a.entity_id,
              a.detail_json,
              a.created_at,
              u.email AS user_email,
              u.first_name AS user_first_name,
              u.last_name AS user_last_name
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset)
    .map((row) => ({
      id: row.id,
      userId: row.user_id,
      userEmail: row.user_email,
      userName: row.user_first_name ? `${row.user_first_name} ${row.user_last_name}` : null,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id,
      detail: row.detail_json ? JSON.parse(row.detail_json) : null,
      createdAt: row.created_at
    }));
}
