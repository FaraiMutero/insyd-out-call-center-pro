import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getOrgStats, getAgentLeaderboard, getAgentDetail, getTipOfDay } from "../db/dashboardRepository.js";

export const dashboardRoutes = Router();

dashboardRoutes.use(requireAuth, requireRole(["admin", "manager", "qa"]));

/* GET /api/dashboard/org */
dashboardRoutes.get("/org", (_req, res) => {
  res.json({ stats: getOrgStats() });
});

/* GET /api/dashboard/leaderboard */
dashboardRoutes.get("/leaderboard", (_req, res) => {
  res.json({ agents: getAgentLeaderboard() });
});

/* GET /api/dashboard/agents/:name */
dashboardRoutes.get("/agents/:name", (req, res) => {
  const agentName = decodeURIComponent(req.params.name);
  const detail = getAgentDetail(agentName);
  res.json({ agent: { agentName, ...detail } });
});

/* GET /api/dashboard/tip */
dashboardRoutes.get("/tip", (_req, res) => {
  const tip = getTipOfDay();
  res.json({ tip });
});
