import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getUserById, listUsers, publicUser, updateUserRole } from "../db/usersRepository.js";
import { createAgentByAdmin, deactivateUser, reactivateUser, updateProfile } from "../services/authService.js";

export const agentRoutes = Router();

agentRoutes.use(requireAuth);

/**
 * @openapi
 * /agents:
 *   get:
 *     tags: [Agents]
 *     summary: List agent profiles (admin, manager, qa)
 *     description: Users with role `agent`. This is the user-profile view; call performance comes from /dashboard/leaderboard, matched by name on the client.
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, active, rejected, deactivated] }
 *     responses:
 *       200:
 *         description: Agent profile list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agents: { type: array, items: { $ref: '#/components/schemas/User' } }
 */
agentRoutes.get("/", requireRole(["admin", "manager", "qa"]), (req, res) => {
  const agents = listUsers({ role: "agent", status: req.query.status });
  res.json({ agents });
});

/**
 * @openapi
 * /agents:
 *   post:
 *     tags: [Agents]
 *     summary: Create a new agent profile (admin only)
 *     description: Unlike public registration, admin-created agents are activated immediately (no pending approval step).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 10, description: "Must contain letters and digits" }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *     responses:
 *       201:
 *         description: Agent created
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { user: { $ref: '#/components/schemas/User' } } }
 *       400: { description: Validation error, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: Email already exists, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
agentRoutes.post("/", requireRole(["admin"]), async (req, res) => {
  const { email, password, firstName, lastName } = req.body || {};
  const result = await createAgentByAdmin({
    actorUserId: req.user.id,
    email,
    password,
    firstName,
    lastName,
    role: "agent"
  });
  res.status(result.status).json(result.body);
});

/**
 * @openapi
 * /agents/{id}:
 *   patch:
 *     tags: [Agents]
 *     summary: Update an agent's name or promote/demote their role (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               role: { type: string, enum: [admin, manager, qa, agent] }
 *     responses:
 *       200:
 *         description: Agent updated
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { user: { $ref: '#/components/schemas/User' } } }
 *       404: { description: No agent profile with this id, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
agentRoutes.patch("/:id", requireRole(["admin"]), async (req, res) => {
  const userId = Number(req.params.id);
  const target = getUserById(userId);
  if (!target || target.role !== "agent") {
    return res.status(404).json({ error: "NOT_FOUND", message: "No agent profile with this id" });
  }

  const { firstName, lastName, role } = req.body || {};
  const result = await updateProfile({
    userId,
    firstName: firstName || target.first_name,
    lastName: lastName || target.last_name
  });
  if (result.status !== 200) {
    return res.status(result.status).json(result.body);
  }

  if (role && role !== target.role) {
    updateUserRole({ userId, role });
  }

  res.json({ user: publicUser(getUserById(userId)) });
});

/**
 * @openapi
 * /agents/{id}:
 *   delete:
 *     tags: [Agents]
 *     summary: Deactivate an agent profile (admin only)
 *     description: Soft-delete — revokes all of the agent's refresh tokens. Use POST /agents/{id}/reactivate to restore.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Agent deactivated
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { user: { $ref: '#/components/schemas/User' } } }
 *       404: { description: No agent profile with this id, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
agentRoutes.delete("/:id", requireRole(["admin"]), (req, res) => {
  const userId = Number(req.params.id);
  const target = getUserById(userId);
  if (!target || target.role !== "agent") {
    return res.status(404).json({ error: "NOT_FOUND", message: "No agent profile with this id" });
  }

  const result = deactivateUser({ actorUserId: req.user.id, userId });
  res.status(result.status).json(result.body);
});

/**
 * @openapi
 * /agents/{id}/reactivate:
 *   post:
 *     tags: [Agents]
 *     summary: Reactivate a deactivated agent profile (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Agent reactivated
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { user: { $ref: '#/components/schemas/User' } } }
 *       404: { description: No agent profile with this id, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
agentRoutes.post("/:id/reactivate", requireRole(["admin"]), (req, res) => {
  const userId = Number(req.params.id);
  const target = getUserById(userId);
  if (!target || target.role !== "agent") {
    return res.status(404).json({ error: "NOT_FOUND", message: "No agent profile with this id" });
  }

  const result = reactivateUser({ actorUserId: req.user.id, userId });
  res.status(result.status).json(result.body);
});
