// =====================================================================
// learning-paths/learning-paths.recommendations.routes.ts — Route "Gợi ý cho bạn" (T24).
// =====================================================================
import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticateActiveAccount } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/requireRole";
import { validateQuery } from "../../middlewares/validate";
import { getMyRecommendationsHandler } from "./learning-paths.recommendations.controller";
import { recommendationsQuerySchema } from "./learning-paths.schema";

export const recommendationRoutes = Router();

// Mọi route yêu cầu tài khoản ACTIVE.
recommendationRoutes.use(authenticateActiveAccount);

// GET /api/v1/recommendations/me  (chỉ STUDENT; studentId lấy từ token)
// Thứ tự: đăng nhập (401, tài khoản PENDING/LOCKED 403) -> vai trò (403) -> định dạng `limit` (400).
recommendationRoutes.get(
  "/me",
  requireRole(Role.STUDENT),
  validateQuery(recommendationsQuerySchema),
  getMyRecommendationsHandler
);