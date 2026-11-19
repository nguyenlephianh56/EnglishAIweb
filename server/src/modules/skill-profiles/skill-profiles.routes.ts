// TODO: skill-profiles - routes
import { Router } from "express";
import { Role } from "@prisma/client";
import * as skillProfilesController from "./skill-profiles.controller";
import { studentIdParamSchema } from "./skill-profiles.schema";
import { authenticateActiveAccount } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/requireRole";
import { validateParams } from "../../middlewares/validate";

export const skillProfileRoutes = Router();

// Mọi route yêu cầu tài khoản ACTIVE.
skillProfileRoutes.use(authenticateActiveAccount);

// GET /api/v1/skill-profiles/me  (chỉ STUDENT; studentId lấy từ token)
// Khai báo TRƯỚC các route có tham số để "me" không bị hiểu là một id.
skillProfileRoutes.get(
  "/me",
  requireRole(Role.STUDENT),
  skillProfilesController.getMyProfile
);

// GET /api/v1/skill-profiles/students/:studentId  (TEACHER: chỉ HS trong lớp của mình; ADMIN: mọi HS)
// Thứ tự: đăng nhập (401) -> vai trò (403) -> định dạng :studentId (400) -> quyền theo lớp (404, ở service).
skillProfileRoutes.get(
  "/students/:studentId",
  requireRole(Role.TEACHER, Role.ADMIN),
  validateParams(studentIdParamSchema),
  skillProfilesController.getStudentProfile
);
