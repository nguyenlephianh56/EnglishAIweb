// =====================================================================
// learning-paths/learning-paths.recommendations.controller.ts — GET /api/v1/recommendations/me (T24).
//
// Controller KHÔNG tự truy vấn DB. Quyền vai trò đã được requireRole chặn ở route; ở đây chỉ lấy
// studentId từ TOKEN (không nhận từ client) rồi giao cho service.
// =====================================================================
import type { NextFunction, Request, Response } from "express";
import { failure, success } from "../../utils/response";
import { getMyRecommendations } from "./learning-paths.service";
import { resolveRecommendationLimit, type RecommendationsQuery } from "./learning-paths.schema";

export const getMyRecommendationsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);

    // Đã qua validateQuery nên query hợp lệ.
    const limit = resolveRecommendationLimit(res.locals.query as RecommendationsQuery);
    const data = await getMyRecommendations(req.user.id, limit);
    return success(res, data);
  } catch (error) {
    return next(error); // lỗi lạ -> errorHandler (500, không lộ chi tiết)
  }
};