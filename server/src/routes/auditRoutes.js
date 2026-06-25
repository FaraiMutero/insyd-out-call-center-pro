import { Router } from "express";
import { listAuditLogs } from "../db/auditRepository.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const auditRoutes = Router();

auditRoutes.use(requireAuth, requireRole(["admin"]));

/**
 * @openapi
 * /audit:
 *   get:
 *     tags: [Audit]
 *     summary: List audit log entries (admin only)
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100, maximum: 200 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Audit log page
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       userId: { type: integer, nullable: true }
 *                       action: { type: string }
 *                       entity: { type: string }
 *                       entityId: { type: string }
 *                       detail: { type: object, nullable: true }
 *                       createdAt: { type: string, format: date-time }
 *                 limit: { type: integer }
 *                 offset: { type: integer }
 *       403: { description: Not an admin, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
auditRoutes.get("/", (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);
  const logs = listAuditLogs({ limit, offset });
  res.json({ logs, limit, offset });
});
