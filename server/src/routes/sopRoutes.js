import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createRubric, getActiveRubric } from "../db/analysisRepository.js";
import { routeAsync } from "../utils/routeAsync.js";
import { DEFAULT_OUTBOUND_RUBRIC } from "../services/defaultRubric.js";

export const sopRoutes = Router();

sopRoutes.use(requireAuth, requireRole(["admin", "manager"]));

/* GET /api/sops/rubric — return the current active rubric */
sopRoutes.get("/rubric", (req, res) => {
  const callType = req.query.callType || "outbound_sales";
  const rubric = getActiveRubric(callType);
  if (!rubric) return res.status(404).json({ error: "NO_RUBRIC", message: "No active rubric. POST /api/sops/generate to create one." });
  res.json({ rubric });
});

/* POST /api/sops/generate — create (or recreate) the default outbound-sales rubric */
sopRoutes.post("/generate", routeAsync(async (req, res) => {
  const callType = req.body?.callType || "outbound_sales";

  const criteria = callType === "outbound_sales"
    ? DEFAULT_OUTBOUND_RUBRIC
    : DEFAULT_OUTBOUND_RUBRIC; // extend for other call types in future

  const rubric = createRubric({
    title: `${callType === "outbound_sales" ? "Outbound Sales" : callType} — Standard Rubric`,
    callType,
    criteria,
    createdBy: req.user.id,
  });

  res.status(201).json({ rubric });
}));
