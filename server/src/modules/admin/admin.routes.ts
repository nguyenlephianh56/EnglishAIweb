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

export const adminRoutes = Router();

// Mọi route trong file này đều yêu cầu: đã đăng nhập + là ADMIN
// authenticateActiveAccount chạy trước để gắn req.user,
// rồi requireRole mới đọc được req.user.role
adminRoutes.use(authenticateActiveAccount, requireRole(Role.ADMIN));

// GET /api/v1/admin/users?role=&status=
adminRoutes.get("/users", adminController.listUsers);

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
adminRoutes.get("/prompts/:key", getAdminPromptHandler);
adminRoutes.put("/prompts/:key", requireKnownPromptKey, validate(updatePromptTemplateBodySchema), updateAdminPromptHandler);
adminRoutes.post("/prompts/:key/reset", requireKnownPromptKey, validate(resetPromptTemplateBodySchema), resetAdminPromptHandler);

// Hạn mức gọi AI mỗi ngày (T26)
adminRoutes.get("/ai-limits", getAdminAiLimitsHandler);
adminRoutes.put("/ai-limits", validate(aiDailyLimitsSchema), updateAdminAiLimitsHandler);