import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getCoachingItemsByAgent } from "../db/analysisRepository.js";
import { getAgentLeaderboard } from "../db/dashboardRepository.js";

export const coachingRoutes = Router();

coachingRoutes.use(requireAuth);

/**
 * @openapi
 * /coaching/{agentName}:
 *   get:
 *     tags: [Coaching]
 *     summary: Coaching feed for one agent
 *     description: Agents can only fetch their own coaching feed; admins/managers/qa can fetch any agent's.
 *     parameters:
 *       - in: path
 *         name: agentName
 *         required: true
 *         schema: { type: string }
 *         description: Agent display name (URL-encoded)
 *     responses:
 *       200:
 *         description: Coaching items
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agentName: { type: string }
 *                 items: { type: array, items: { type: object } }
 *       403: { description: Agent requesting another agent's feed, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
/* GET /api/coaching/:agentName — coaching items for one agent.
   Agents can only fetch their own; managers/admins can fetch any. */
coachingRoutes.get("/:agentName", (req, res) => {
  const agentName = decodeURIComponent(req.params.agentName);
  const { role, firstName, lastName } = req.user;
  const ownName = `${firstName} ${lastName}`;

  if (role === "agent" && agentName !== ownName) {
    return res.status(403).json({ error: "FORBIDDEN", message: "Agents can only view their own coaching." });
  }

  const items = getCoachingItemsByAgent(agentName);
  res.json({ agentName, items });
});

/**
 * @openapi
 * /coaching:
 *   get:
 *     tags: [Coaching]
 *     summary: List all agents with coaching items (admin, manager, qa)
 *     responses:
 *       200:
 *         description: Agents with coaching counts
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
 *                       itemCount: { type: integer }
 */
/* GET /api/coaching — list all agents that have coaching items (managers+) */
coachingRoutes.get("/", requireRole(["admin", "manager", "qa"]), (_req, res) => {
  const agents = getAgentLeaderboard().map(a => {
    const items = getCoachingItemsByAgent(a.agentName);
    return { agentName: a.agentName, callCount: a.callCount, avgScore: a.avgScore, itemCount: items.length };
  });
  res.json({ agents });
});
