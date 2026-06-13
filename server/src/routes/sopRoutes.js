import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createRubric, getActiveRubric, getRubricById, listRubrics, updateRubricCriteria } from "../db/analysisRepository.js";
import { routeAsync } from "../utils/routeAsync.js";
import { DEFAULT_OUTBOUND_RUBRIC } from "../services/defaultRubric.js";

export const sopRoutes = Router();

sopRoutes.use(requireAuth, requireRole(["admin", "manager"]));

/* GET /api/sops/rubrics — list all rubrics */
sopRoutes.get("/rubrics", (_req, res) => {
  res.json({ rubrics: listRubrics() });
});

/* GET /api/sops/rubric — active rubric for a call type */
sopRoutes.get("/rubric", (req, res) => {
  const callType = req.query.callType || "outbound_sales";
  const rubric = getActiveRubric(callType);
  if (!rubric) return res.status(404).json({ error: "NO_RUBRIC", message: "No active rubric. POST /api/sops/generate to create one." });
  res.json({ rubric });
});

/* POST /api/sops/generate — create (or recreate) default rubric */
sopRoutes.post("/generate", routeAsync(async (req, res) => {
  const callType = req.body?.callType || "outbound_sales";
  const rubric = createRubric({
    title: `${callType === "outbound_sales" ? "Outbound Sales" : callType} — Standard Rubric`,
    callType,
    criteria: DEFAULT_OUTBOUND_RUBRIC,
    createdBy: req.user.id,
  });
  res.status(201).json({ rubric });
}));

/* PATCH /api/sops/rubric/:id — update criteria (weights must sum to 100) */
sopRoutes.patch("/rubric/:id", routeAsync(async (req, res) => {
  const id = Number(req.params.id);
  const { criteria } = req.body || {};
  if (!Array.isArray(criteria) || !criteria.length) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "criteria array is required" });
  }
  try {
    const rubric = updateRubricCriteria(id, criteria);
    if (!rubric) return res.status(404).json({ error: "NOT_FOUND" });
    res.json({ rubric });
  } catch (err) {
    res.status(422).json({ error: "VALIDATION_ERROR", message: err.message });
  }
}));
