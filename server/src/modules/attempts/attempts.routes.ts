import { Router } from "express";
import { Role } from "@prisma/client";
import * as attemptsController from "./attempts.controller";
import { createAttemptSchema } from "./attempts.schema";
import { validate } from "../../middlewares/validate";
import { authenticate } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/requireRole";

export const attemptRoutes = Router();

// Mọi route attempts đều yêu cầu đăng nhập (authenticate đã chặn PENDING/LOCKED bằng 401)
attemptRoutes.use(authenticate);

// POST /api/v1/attempts  (chỉ STUDENT; TEACHER/ADMIN bị 403, không token -> 401)
// Thứ tự quan trọng: kiểm quyền TRƯỚC khi kiểm body, để GV/Admin luôn nhận 403.
attemptRoutes.post(
  "/",
  requireRole(Role.STUDENT),
  validate(createAttemptSchema),
  attemptsController.createAttempt
);