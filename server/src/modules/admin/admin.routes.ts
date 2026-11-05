import { Router } from "express";
import { Role } from "@prisma/client";
import * as adminController from "./admin.controller";
import { authenticate } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/requireRole";

export const adminRoutes = Router();

// Mọi route trong file này đều yêu cầu: đã đăng nhập + là ADMIN
// Thứ tự quan trọng: authenticate chạy trước để gắn req.user,
// rồi requireRole mới đọc được req.user.role
adminRoutes.use(authenticate, requireRole(Role.ADMIN));

// GET /api/v1/admin/users?role=&status=
adminRoutes.get("/users", adminController.listUsers);

// PATCH /api/v1/admin/users/:id/approve
adminRoutes.patch("/users/:id/approve", adminController.approveTeacher);

// PATCH /api/v1/admin/users/:id/lock
adminRoutes.patch("/users/:id/lock", adminController.lockUser);

// PATCH /api/v1/admin/users/:id/unlock
adminRoutes.patch("/users/:id/unlock", adminController.unlockUser);