import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getOrgStats, getAgentLeaderboard, getAgentDetail, getTipOfDay } from "../db/dashboardRepository.js";
import { renameAgentAcrossRecordings } from "../db/recordingsRepository.js";
import { writeAudit } from "../db/auditRepository.js";

export const dashboardRoutes = Router();

dashboardRoutes.use(requireAuth, requireRole(["admin", "manager", "qa"]));

/**
 * @openapi
 * /dashboard/org:
 *   get:
 *     tags: [Dashboard]
 *     summary: Org-wide call/QA stats (admin, manager, qa)
 *     responses:
 *       200:
 *         description: Org stats
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { stats: { type: object } } }
 */
/* GET /api/dashboard/org */
dashboardRoutes.get("/org", (_req, res) => {
  res.json({ stats: getOrgStats() });
});

/**
 * @openapi
 * /dashboard/leaderboard:
 *   get:
 *     tags: [Dashboard]
 *     summary: Agent leaderboard ranked by QA score (admin, manager, qa)
 *     responses:
 *       200:
 *         description: Leaderboard
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agents:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       agentName: { type: string }
 *                       callCount: { type: integer }
 *                       avgScore: { type: number }
 */
/* GET /api/dashboard/leaderboard */
dashboardRoutes.get("/leaderboard", (_req, res) => {
  res.json({ agents: getAgentLeaderboard() });
});

/**
 * @openapi
 * /dashboard/agents/{name}:
 *   get:
 *     tags: [Dashboard]
 *     summary: Detail stats for a single agent (admin, manager, qa)
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema: { type: string }
 *         description: Agent display name (URL-encoded)
 *     responses:
 *       200:
 *         description: Agent detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agent:
 *                   type: object
 *                   properties: { agentName: { type: string } }
 */
/* GET /api/dashboard/agents/:name */
dashboardRoutes.get("/agents/:name", (req, res) => {
  const agentName = decodeURIComponent(req.params.name);
  const detail = getAgentDetail(agentName);
  res.json({ agent: { agentName, ...detail } });
});

/**
 * @openapi
 * /dashboard/agents/{name}:
 *   patch:
 *     tags: [Dashboard]
 *     summary: Rename an agent across all their recordings (admin only)
 *     description: Renames the free-text agent_name on every recording attributed to this agent — used for call-derived agents that have no linked user account.
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema: { type: string }
 *         description: Current agent display name (URL-encoded)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newName]
 *             properties: { newName: { type: string } }
 *     responses:
 *       200:
 *         description: Agent renamed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { agentName: { type: string }, recordingsUpdated: { type: integer } }
 *       400: { description: Validation error, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No recordings for this agent name, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
dashboardRoutes.patch("/agents/:name", requireRole(["admin"]), (req, res) => {
  const oldName = decodeURIComponent(req.params.name);
  const newName = (req.body?.newName || "").trim();

  if (!newName) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "New name is required" });
  }

  const recordingsUpdated = renameAgentAcrossRecordings(oldName, newName);
  if (recordingsUpdated === 0) {
    return res.status(404).json({ error: "NOT_FOUND", message: "No recordings found for this agent name" });
  }

  writeAudit({
    userId: req.user.id,
    action: "AGENT_RENAMED",
    entity: "agent",
    detail: { oldName, newName, recordingsUpdated }
  });

  res.json({ agentName: newName, recordingsUpdated });
});

/**
 * @openapi
 * /dashboard/tip:
 *   get:
 *     tags: [Dashboard]
 *     summary: Get the QA tip of the day (admin, manager, qa)
 *     responses:
 *       200:
 *         description: Tip
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { tip: { type: string } } }
 */
/* GET /api/dashboard/tip */
dashboardRoutes.get("/tip", (_req, res) => {
  const tip = getTipOfDay();
  res.json({ tip });
});
