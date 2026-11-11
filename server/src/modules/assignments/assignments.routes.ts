import { Router } from "express";
import { Role } from "@prisma/client";
import * as assignmentsController from "./assignments.controller";
import {
  assignmentIdParamSchema,
  createAssignmentSchema,
  listAssignmentsQuerySchema,
} from "./assignments.schema";
import {
  validate,
  validateParams,
  validateQuery,
} from "../../middlewares/validate";
import { authenticate } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/requireRole";

export const assignmentRoutes = Router();

// Mọi route assignments đều yêu cầu đăng nhập (authenticate đã chặn PENDING/LOCKED bằng 401)
assignmentRoutes.use(authenticate);

// POST /api/v1/assignments  (chỉ TEACHER; STUDENT/ADMIN bị 403, không token -> 401)
// Quyền kiểm TRƯỚC khi kiểm body, để STUDENT/ADMIN luôn nhận 403 (không phải 400).
assignmentRoutes.post(
  "/",
  requireRole(Role.TEACHER),
  validate(createAssignmentSchema),
  assignmentsController.createAssignment
);

// GET /api/v1/assignments  (STUDENT: bài được giao | TEACHER: bài đã giao ở lớp mình; ADMIN bị 403)
// Quyền kiểm TRƯỚC khi kiểm query, để ADMIN luôn nhận 403 (không phải 400).
assignmentRoutes.get(
  "/",
  requireRole(Role.STUDENT, Role.TEACHER),
  validateQuery(listAssignmentsQuerySchema),
  assignmentsController.listAssignments
);

// GET /api/v1/assignments/:id  (chi tiết bài giao + đề; chỉ STUDENT là thành viên lớp)
// Đặt sau route "/" ở trên. Quyền kiểm TRƯỚC khi kiểm :id, để GV/ADMIN luôn nhận 403.
assignmentRoutes.get(
  "/:id",
  requireRole(Role.STUDENT),
  validateParams(assignmentIdParamSchema),
  assignmentsController.getAssignment
);

// GET /api/v1/assignments/:id/submissions  (bài nộp của cả lớp; chỉ TEACHER chủ lớp, ADMIN bị 403)
// Quyền kiểm TRƯỚC khi kiểm :id, để HS/ADMIN luôn nhận 403.
assignmentRoutes.get(
  "/:id/submissions",
  requireRole(Role.TEACHER),
  validateParams(assignmentIdParamSchema),
  assignmentsController.getSubmissions
);