import { Router } from "express";
import { Role } from "@prisma/client";
import * as attemptsController from "./attempts.controller";
import {
  attemptIdParamSchema,
  createAttemptSchema,
  listAttemptsQuerySchema,
} from "./attempts.schema";
import {
  validate,
  validateParams,
  validateQuery,
} from "../../middlewares/validate";
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

// GET /api/v1/attempts  (lịch sử bài nộp của CHÍNH HS; chỉ STUDENT)
// Quyền kiểm TRƯỚC khi kiểm query, để GV/Admin luôn nhận 403 (không phải 400).
attemptRoutes.get(
  "/",
  requireRole(Role.STUDENT),
  validateQuery(listAttemptsQuerySchema),
  attemptsController.listAttempts
);

// GET /api/v1/attempts/:id  (chi tiết 1 lần nộp của CHÍNH HS; chỉ STUDENT)
// Đặt sau route "/" ở trên. Quyền kiểm TRƯỚC khi kiểm :id, để GV/Admin luôn nhận 403.
attemptRoutes.get(
  "/:id",
  requireRole(Role.STUDENT),
  validateParams(attemptIdParamSchema),
  attemptsController.getAttempt
);