import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listUsers } from "../db/usersRepository.js";
import {
  approveUser,
  createResetLink,
  deactivateUser,
  reactivateUser,
  rejectUser
} from "../services/authService.js";

export const userRoutes = Router();

userRoutes.use(requireAuth, requireRole("admin"));

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: List users (admin only)
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, active, rejected, deactivated] }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [admin, manager, qa, agent] }
 *     responses:
 *       200:
 *         description: User list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users: { type: array, items: { $ref: '#/components/schemas/User' } }
 *       403: { description: Not an admin, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
userRoutes.get("/", (req, res) => {
  const users = listUsers({ status: req.query.status, role: req.query.role });
  res.status(200).json({ users });
});

/**
 * @openapi
 * /users/{id}/approve:
 *   post:
 *     tags: [Users]
 *     summary: Approve a pending user (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties: { role: { type: string, enum: [admin, manager, qa, agent] } }
 *     responses:
 *       200:
 *         description: User approved
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { user: { $ref: '#/components/schemas/User' } } }
 *       404: { description: User not found, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
userRoutes.post("/:id/approve", (req, res) => {
  const result = approveUser({
    actorUserId: req.user.id,
    userId: Number(req.params.id),
    role: req.body?.role
  });
  res.status(result.status).json(result.body);
});

/**
 * @openapi
 * /users/{id}/reject:
 *   post:
 *     tags: [Users]
 *     summary: Reject a pending user (admin only)
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
 *             properties: { reason: { type: string } }
 *     responses:
 *       200:
 *         description: User rejected
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { user: { $ref: '#/components/schemas/User' } } }
 *       404: { description: User not found, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
userRoutes.post("/:id/reject", (req, res) => {
  const result = rejectUser({
    actorUserId: req.user.id,
    userId: Number(req.params.id),
    reason: req.body?.reason
  });
  res.status(result.status).json(result.body);
});

/**
 * @openapi
 * /users/{id}/deactivate:
 *   post:
 *     tags: [Users]
 *     summary: Deactivate an active user (admin only)
 *     description: Revokes all of the user's refresh tokens, ending their session immediately.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: User deactivated
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { user: { $ref: '#/components/schemas/User' } } }
 *       404: { description: User not found, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
userRoutes.post("/:id/deactivate", (req, res) => {
  const result = deactivateUser({ actorUserId: req.user.id, userId: Number(req.params.id) });
  res.status(result.status).json(result.body);
});

/**
 * @openapi
 * /users/{id}/reactivate:
 *   post:
 *     tags: [Users]
 *     summary: Reactivate a deactivated user (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: User reactivated
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { user: { $ref: '#/components/schemas/User' } } }
 *       404: { description: User not found, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
userRoutes.post("/:id/reactivate", (req, res) => {
  const result = reactivateUser({ actorUserId: req.user.id, userId: Number(req.params.id) });
  res.status(result.status).json(result.body);
});

/**
 * @openapi
 * /users/{id}/reset-link:
 *   post:
 *     tags: [Users]
 *     summary: Generate a password reset link for a user (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Reset link generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 resetLink: { type: string }
 *                 expiresAt: { type: string, format: date-time }
 *       404: { description: User not found, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
userRoutes.post("/:id/reset-link", (req, res) => {
  const result = createResetLink({ actorUserId: req.user.id, targetUserId: Number(req.params.id) });
  res.status(result.status).json(result.body);
});
