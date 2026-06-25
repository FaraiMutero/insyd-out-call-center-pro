import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  changePassword,
  createResetLink,
  getAuthStatus,
  login,
  logout,
  refreshSession,
  register,
  resetPassword,
  updateProfile
} from "../services/authService.js";

export const authRoutes = Router();

function setRefreshCookie(res, token) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: Number(process.env.JWT_REFRESH_TTL_DAYS || 7) * 24 * 60 * 60 * 1000,
    path: "/api/auth"
  });
}

function clearRefreshCookie(res) {
  res.clearCookie("refreshToken", { path: "/api/auth" });
}

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new account
 *     description: The first user ever registered is auto-approved as admin; subsequent users land in `pending` status until an admin approves them.
 *     security: []
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
 *               requestedRole: { type: string, enum: [admin, manager, qa, agent], default: agent }
 *     responses:
 *       201:
 *         description: Account created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user: { $ref: '#/components/schemas/User' }
 *                 message: { type: string }
 *       400: { description: Validation error, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: Email already exists, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
authRoutes.post("/register", async (req, res) => {
  const result = await register(req.body || {});
  res.status(result.status).json(result.body);
});

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with email and password
 *     description: On success, sets an httpOnly `refreshToken` cookie (path `/api/auth`) and returns a short-lived access token in the body.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Logged in
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken: { type: string }
 *                 user: { $ref: '#/components/schemas/User' }
 *       401: { description: Invalid credentials, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Account pending approval or inactive, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
authRoutes.post("/login", async (req, res) => {
  const result = await login(req.body || {});
  if (result.status !== 200) {
    return res.status(result.status).json(result.body);
  }
  setRefreshCookie(res, result.body.refreshToken);
  return res.status(200).json({ accessToken: result.body.accessToken, user: result.body.user });
});

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate the refresh cookie and issue a new access token
 *     description: Reads the httpOnly `refreshToken` cookie. The refresh token is single-use — each call revokes the old token and issues a new one.
 *     security: []
 *     responses:
 *       200:
 *         description: New token pair issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken: { type: string }
 *                 user: { $ref: '#/components/schemas/User' }
 *       401: { description: Missing, invalid, expired or already-used refresh token, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
authRoutes.post("/refresh", (req, res) => {
  const result = refreshSession(req.cookies.refreshToken);
  if (result.status !== 200) {
    clearRefreshCookie(res);
    return res.status(result.status).json(result.body);
  }

  setRefreshCookie(res, result.body.refreshToken);
  return res.status(200).json({ accessToken: result.body.accessToken, user: result.body.user });
});

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke the current refresh token and clear the cookie
 *     security: []
 *     responses:
 *       200:
 *         description: Logged out
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { message: { type: string } } }
 */
authRoutes.post("/logout", (req, res) => {
  logout(req.cookies.refreshToken);
  clearRefreshCookie(res);
  res.status(200).json({ message: "Logged out" });
});

/**
 * @openapi
 * /auth/status:
 *   get:
 *     tags: [Auth]
 *     summary: Get the current authenticated user
 *     responses:
 *       200:
 *         description: Current session user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { user: { $ref: '#/components/schemas/User' } }
 *       401: { description: Missing or invalid access token, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
authRoutes.get("/status", requireAuth, (req, res) => {
  const user = getAuthStatus(req.user.id);
  res.status(200).json({ user });
});

/**
 * @openapi
 * /auth/profile:
 *   put:
 *     tags: [Auth]
 *     summary: Update the current user's first/last name
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName]
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *     responses:
 *       200:
 *         description: Updated user
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { user: { $ref: '#/components/schemas/User' } } }
 *       400: { description: Validation error, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
authRoutes.put("/profile", requireAuth, async (req, res) => {
  const result = await updateProfile({ userId: req.user.id, ...req.body });
  res.status(result.status).json(result.body);
});

/**
 * @openapi
 * /auth/password:
 *   put:
 *     tags: [Auth]
 *     summary: Change the current user's password
 *     description: Requires the current password. Revokes all existing refresh tokens for the user on success.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 10 }
 *     responses:
 *       200:
 *         description: Password changed
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { message: { type: string } } }
 *       400: { description: Validation error, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Current password incorrect, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
authRoutes.put("/password", requireAuth, async (req, res) => {
  const result = await changePassword({ userId: req.user.id, ...req.body });
  res.status(result.status).json(result.body);
});

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Complete a password reset using a one-time token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token: { type: string, description: "Raw token from the reset link" }
 *               newPassword: { type: string, minLength: 10 }
 *     responses:
 *       200:
 *         description: Password reset
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { message: { type: string } } }
 *       400: { description: Invalid/expired token or validation error, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
authRoutes.post("/reset-password", async (req, res) => {
  const result = await resetPassword(req.body || {});
  res.status(result.status).json(result.body);
});

/**
 * @openapi
 * /auth/admin-reset-link:
 *   post:
 *     tags: [Auth]
 *     summary: (Admin) Generate a password reset link for any user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties: { userId: { type: integer } }
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
 *       403: { description: Not an admin, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: User not found, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
authRoutes.post("/admin-reset-link", requireAuth, requireRole(["admin"]), async (req, res) => {
  const result = createResetLink({ actorUserId: req.user.id, targetUserId: Number(req.body.userId) });
  res.status(result.status).json(result.body);
});
