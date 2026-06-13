import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getCoachingItemsByAgent } from "../db/analysisRepository.js";
import { getAgentLeaderboard } from "../db/dashboardRepository.js";

export const coachingRoutes = Router();

coachingRoutes.use(requireAuth);

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

/* GET /api/coaching — list all agents that have coaching items (managers+) */
coachingRoutes.get("/", requireRole(["admin", "manager", "qa"]), (_req, res) => {
  const agents = getAgentLeaderboard().map(a => {
    const items = getCoachingItemsByAgent(a.agentName);
    return { agentName: a.agentName, callCount: a.callCount, avgScore: a.avgScore, itemCount: items.length };
  });
  res.json({ agents });
});
