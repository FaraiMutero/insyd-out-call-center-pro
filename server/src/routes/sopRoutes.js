import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createRubric, getActiveRubric, getRubricById, listRubrics, updateRubricCriteria } from "../db/analysisRepository.js";
import { routeAsync } from "../utils/routeAsync.js";
import { DEFAULT_OUTBOUND_RUBRIC, DEFAULT_INBOUND_RUBRIC } from "../services/defaultRubric.js";

const DEFAULT_CRITERIA_BY_CALL_TYPE = {
  outbound_sales: DEFAULT_OUTBOUND_RUBRIC,
  inbound: DEFAULT_INBOUND_RUBRIC,
};
const CALL_TYPE_TITLE = {
  outbound_sales: "Outbound Sales",
  inbound: "Inbound Support",
};

export const sopRoutes = Router();

sopRoutes.use(requireAuth, requireRole(["admin", "manager"]));

/**
 * @openapi
 * /sops/rubrics:
 *   get:
 *     tags: [SOPs]
 *     summary: List all QA scoring rubrics (admin, manager)
 *     responses:
 *       200:
 *         description: Rubric list
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { rubrics: { type: array, items: { $ref: '#/components/schemas/Rubric' } } } }
 */
/* GET /api/sops/rubrics — list all rubrics */
sopRoutes.get("/rubrics", (_req, res) => {
  res.json({ rubrics: listRubrics() });
});

/**
 * @openapi
 * /sops/rubric:
 *   get:
 *     tags: [SOPs]
 *     summary: Get the active rubric for a call type (admin, manager)
 *     parameters:
 *       - in: query
 *         name: callType
 *         schema: { type: string, default: outbound_sales }
 *     responses:
 *       200:
 *         description: Active rubric
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { rubric: { $ref: '#/components/schemas/Rubric' } } }
 *       404: { description: No active rubric for this call type, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
/* GET /api/sops/rubric — active rubric for a call type */
sopRoutes.get("/rubric", (req, res) => {
  const callType = req.query.callType || "outbound_sales";
  const rubric = getActiveRubric(callType);
  if (!rubric) return res.status(404).json({ error: "NO_RUBRIC", message: "No active rubric. POST /api/sops/generate to create one." });
  res.json({ rubric });
});

/**
 * @openapi
 * /sops/generate:
 *   post:
 *     tags: [SOPs]
 *     summary: Create (or recreate) the default rubric for a call type (admin, manager)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties: { callType: { type: string, default: outbound_sales } }
 *     responses:
 *       201:
 *         description: Rubric created
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { rubric: { $ref: '#/components/schemas/Rubric' } } }
 */
/* POST /api/sops/generate — create (or recreate) default rubric */
sopRoutes.post("/generate", routeAsync(async (req, res) => {
  const callType = req.body?.callType || "outbound_sales";
  const rubric = createRubric({
    title: `${CALL_TYPE_TITLE[callType] || callType} — Standard Scorecard`,
    callType,
    criteria: DEFAULT_CRITERIA_BY_CALL_TYPE[callType] || DEFAULT_OUTBOUND_RUBRIC,
    createdBy: req.user.id,
  });
  res.status(201).json({ rubric });
}));

/**
 * @openapi
 * /sops/rubric/{id}:
 *   patch:
 *     tags: [SOPs]
 *     summary: Update a rubric's criteria (admin, manager)
 *     description: Criteria weights must sum to 100.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [criteria]
 *             properties:
 *               criteria:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     weight: { type: number }
 *                     description: { type: string }
 *     responses:
 *       200:
 *         description: Rubric updated
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { rubric: { $ref: '#/components/schemas/Rubric' } } }
 *       400: { description: criteria array is required, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: Rubric not found, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       422: { description: Weights do not sum to 100, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
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
