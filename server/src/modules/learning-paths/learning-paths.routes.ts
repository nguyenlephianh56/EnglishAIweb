// =====================================================================
// learning-paths/learning-paths.routes.ts — Route lộ trình học (T24). Mount tại /api/v1/learning-path.
// =====================================================================
import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticateActiveAccount } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/requireRole";
import { validate, validateParams } from "../../middlewares/validate";
import {
  createMyLearningPathHandler,
  getMyLearningPathHandler,
  updateLearningPathItemHandler,
} from "./learning-paths.controller";
import { createLearningPathBodySchema, itemIdParamSchema, updateItemBodySchema } from "./learning-paths.schema";

export const learningPathRoutes = Router();

// Mọi route yêu cầu tài khoản ACTIVE (401; PENDING/LOCKED 403), rồi mới đến vai trò.
learningPathRoutes.use(authenticateActiveAccount);

// GET  /api/v1/learning-path/me
learningPathRoutes.get("/me", requireRole(Role.STUDENT), getMyLearningPathHandler);

// POST /api/v1/learning-path/me  (body trống hoặc {}; field lạ -> 400)
learningPathRoutes.post("/me", requireRole(Role.STUDENT), validate(createLearningPathBodySchema), createMyLearningPathHandler);


// PATCH /api/v1/learning-path/items/:itemId  (body { done: boolean })
// Thứ tự: đăng nhập (401/403) -> vai trò (403) -> itemId (400) -> body (400) -> quyền sở hữu (404).
learningPathRoutes.patch(
  "/items/:itemId",
  requireRole(Role.STUDENT),
  validateParams(itemIdParamSchema),
  validate(updateItemBodySchema),
  updateLearningPathItemHandler
);