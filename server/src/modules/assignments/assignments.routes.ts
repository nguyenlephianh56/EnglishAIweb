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
import { authenticateActiveAccount } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/requireRole";

export const assignmentRoutes = Router();

// Mọi route assignments đều yêu cầu tài khoản ACTIVE.
assignmentRoutes.use(authenticateActiveAccount);

// POST /api/v1/assignments (GV chủ lớp hoặc admin).
assignmentRoutes.post(
  "/",
  requireRole(Role.TEACHER, Role.ADMIN),
  validate(createAssignmentSchema),
  assignmentsController.createAssignment
);

// GET /api/v1/assignments (HS/GV theo lớp của mình, admin xem mọi lớp).
assignmentRoutes.get(
  "/",
  requireRole(Role.STUDENT, Role.TEACHER, Role.ADMIN),
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

// GET /api/v1/assignments/:id/submissions (GV chủ lớp hoặc admin).
assignmentRoutes.get(
  "/:id/submissions",
  requireRole(Role.TEACHER, Role.ADMIN),
  validateParams(assignmentIdParamSchema),
  assignmentsController.getSubmissions
);
