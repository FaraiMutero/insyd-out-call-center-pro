import { Router } from "express";
import { listAuditLogs } from "../db/auditRepository.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const auditRoutes = Router();

auditRoutes.use(requireAuth, requireRole(["admin"]));

auditRoutes.get("/", (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);
  const logs = listAuditLogs({ limit, offset });
  res.json({ logs, limit, offset });
});
