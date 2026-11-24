import { Router } from "express";
import { Role } from "@prisma/client";
import * as adminController from "./admin.controller";
import { aiDailyLimitsSchema } from "../../ai/ai.usage.settings";
import { authenticateActiveAccount } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/requireRole";
import { validate, validateQuery } from "../../middlewares/validate";
import { getAdminAiLimitsHandler, updateAdminAiLimitsHandler } from "./admin.ai-limits.controller";
import { listAuditLogsHandler } from "./admin.audit.controller";
import { listAuditLogsQuerySchema } from "./admin.audit.schema";
import {
  getAdminPromptHandler,
  listAdminPromptsHandler,
  requireKnownPromptKey,
  resetAdminPromptHandler,
  updateAdminPromptHandler,
} from "./admin.prompts.controller";
import { resetPromptTemplateBodySchema, updatePromptTemplateBodySchema } from "./admin.prompts.schema";
import { updateUserHandler } from "./admin.users-update.controller";
import { updateUserBodySchema } from "./admin.users-update.schema";
import { deleteUserHandler } from "./admin.users-delete.controller";
import { promoteAdminHandler, revokeAdminHandler, validatePromoteAdminBody } from "./admin.users-role.controller";
import { revokeAdminBodySchema } from "./admin.users-role.schema";

export const adminRoutes = Router();

// Mọi route trong file này đều yêu cầu: đã đăng nhập + là ADMIN
// authenticateActiveAccount chạy trước để gắn req.user,
// rồi requireRole mới đọc được req.user.role
adminRoutes.use(authenticateActiveAccount, requireRole(Role.ADMIN));

// GET /api/v1/admin/users?role=&status=&q=
adminRoutes.get("/users", adminController.listUsers);

// GET /api/v1/admin/users/:id  (hồ sơ + số liệu, chỉ đọc)
adminRoutes.get("/users/:id", adminController.getUser);

// PATCH /api/v1/admin/users/:id  body { name?, email? } (T29 - Sửa)
// validate(...) chạy trước controller: body .strict(), trim, email chữ thường
adminRoutes.patch("/users/:id", validate(updateUserBodySchema), updateUserHandler);

// DELETE /api/v1/admin/users/:id (T29 - Xóa)
adminRoutes.delete("/users/:id", deleteUserHandler);

// Đổi vai trò admin (T29)
adminRoutes.patch("/users/:id/promote-admin", validatePromoteAdminBody, promoteAdminHandler);
adminRoutes.patch("/users/:id/revoke-admin", validate(revokeAdminBodySchema), revokeAdminHandler);

// PATCH /api/v1/admin/users/:id/approve
adminRoutes.patch("/users/:id/approve", adminController.approveTeacher);

// PATCH /api/v1/admin/users/:id/lock
adminRoutes.patch("/users/:id/lock", adminController.lockUser);

// PATCH /api/v1/admin/users/:id/unlock
adminRoutes.patch("/users/:id/unlock", adminController.unlockUser);

// GET /api/v1/admin/audit-logs
adminRoutes.get("/audit-logs", validateQuery(listAuditLogsQuerySchema), listAuditLogsHandler);

// Cấu hình mẫu prompt (T26)
adminRoutes.get("/prompts", listAdminPromptsHandler);
adminRoutes.get("/prompts/:key", requireKnownPromptKey, getAdminPromptHandler);
adminRoutes.put("/prompts/:key", requireKnownPromptKey, validate(updatePromptTemplateBodySchema), updateAdminPromptHandler);
adminRoutes.post("/prompts/:key/reset", requireKnownPromptKey, validate(resetPromptTemplateBodySchema), resetAdminPromptHandler);

// Hạn mức gọi AI mỗi ngày (T26)
adminRoutes.get("/ai-limits", getAdminAiLimitsHandler);
adminRoutes.put("/ai-limits", validate(aiDailyLimitsSchema), updateAdminAiLimitsHandler);