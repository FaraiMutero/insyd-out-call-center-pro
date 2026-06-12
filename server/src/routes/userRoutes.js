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

userRoutes.get("/", (req, res) => {
  const users = listUsers({ status: req.query.status, role: req.query.role });
  res.status(200).json({ users });
});

userRoutes.post("/:id/approve", (req, res) => {
  const result = approveUser({
    actorUserId: req.user.id,
    userId: Number(req.params.id),
    role: req.body?.role
  });
  res.status(result.status).json(result.body);
});

userRoutes.post("/:id/reject", (req, res) => {
  const result = rejectUser({
    actorUserId: req.user.id,
    userId: Number(req.params.id),
    reason: req.body?.reason
  });
  res.status(result.status).json(result.body);
});

userRoutes.post("/:id/deactivate", (req, res) => {
  const result = deactivateUser({ actorUserId: req.user.id, userId: Number(req.params.id) });
  res.status(result.status).json(result.body);
});

userRoutes.post("/:id/reactivate", (req, res) => {
  const result = reactivateUser({ actorUserId: req.user.id, userId: Number(req.params.id) });
  res.status(result.status).json(result.body);
});

userRoutes.post("/:id/reset-link", (req, res) => {
  const result = createResetLink({ actorUserId: req.user.id, targetUserId: Number(req.params.id) });
  res.status(result.status).json(result.body);
});
