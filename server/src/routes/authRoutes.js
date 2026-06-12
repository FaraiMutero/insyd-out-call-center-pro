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

authRoutes.post("/register", async (req, res) => {
  const result = await register(req.body || {});
  res.status(result.status).json(result.body);
});

authRoutes.post("/login", async (req, res) => {
  const result = await login(req.body || {});
  if (result.status !== 200) {
    return res.status(result.status).json(result.body);
  }
  setRefreshCookie(res, result.body.refreshToken);
  return res.status(200).json({ accessToken: result.body.accessToken, user: result.body.user });
});

authRoutes.post("/refresh", (req, res) => {
  const result = refreshSession(req.cookies.refreshToken);
  if (result.status !== 200) {
    clearRefreshCookie(res);
    return res.status(result.status).json(result.body);
  }

  setRefreshCookie(res, result.body.refreshToken);
  return res.status(200).json({ accessToken: result.body.accessToken, user: result.body.user });
});

authRoutes.post("/logout", (req, res) => {
  logout(req.cookies.refreshToken);
  clearRefreshCookie(res);
  res.status(200).json({ message: "Logged out" });
});

authRoutes.get("/status", requireAuth, (req, res) => {
  const user = getAuthStatus(req.user.id);
  res.status(200).json({ user });
});

authRoutes.put("/profile", requireAuth, async (req, res) => {
  const result = await updateProfile({ userId: req.user.id, ...req.body });
  res.status(result.status).json(result.body);
});

authRoutes.put("/password", requireAuth, async (req, res) => {
  const result = await changePassword({ userId: req.user.id, ...req.body });
  res.status(result.status).json(result.body);
});

authRoutes.post("/reset-password", async (req, res) => {
  const result = await resetPassword(req.body || {});
  res.status(result.status).json(result.body);
});

authRoutes.post("/admin-reset-link", requireAuth, requireRole(["admin"]), async (req, res) => {
  const result = createResetLink({ actorUserId: req.user.id, targetUserId: Number(req.body.userId) });
  res.status(result.status).json(result.body);
});
