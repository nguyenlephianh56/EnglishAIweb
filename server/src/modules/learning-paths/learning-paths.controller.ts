// =====================================================================
// learning-paths/learning-paths.controller.ts — GET/POST /api/v1/learning-path/me, POST /me/ai và PATCH /items/:itemId (T24).
//
// Controller KHÔNG tự truy vấn DB. studentId lấy từ TOKEN (req.user), không nhận từ client.
// Quyền vai trò đã được requireRole chặn ở route.
// =====================================================================
import type { NextFunction, Request, Response } from "express";
import { AIQuotaExceededError } from "../../ai/ai.types";
import { AIInvalidFormatError } from "../../ai/json";
import { AIServiceError } from "../../ai/resilience";
import { failure, success } from "../../utils/response";
import { createCurrentPathWithAi } from "./learning-paths.path.ai.service";
import {
  LearningPathItemNotFoundError,
  NoExercisesAvailableError,
  createCurrentPath,
  getCurrentPath,
  setItemDone,
} from "./learning-paths.path.service";
import type { ItemIdParam, UpdateItemBody } from "./learning-paths.schema";

/** GET /learning-path/me: chưa có lộ trình tuần này thì data = null (vẫn 200). */
export const getMyLearningPathHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    return success(res, await getCurrentPath(req.user.id));
  } catch (error) {
    return next(error);
  }
};

/** POST /learning-path/me: tạo mới -> 201; tuần này đã có -> 200 và trả lộ trình cũ. */
export const createMyLearningPathHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    const { created, path } = await createCurrentPath(req.user.id);
    return success(res, path, created ? 201 : 200);
  } catch (error) {
    if (error instanceof NoExercisesAvailableError) {
      return failure(
        res,
        "NO_EXERCISES_AVAILABLE",
        "Hiện chưa có bài phù hợp để tạo lộ trình. Bạn hãy quay lại sau khi có thêm bài mới.",
        422
      );
    }
    return next(error); // lỗi lạ -> errorHandler (500, không lộ chi tiết)
  }
};

/**
 * POST /learning-path/me/ai: tạo lộ trình tuần bằng AI (task `path`). Mới tạo -> 201; tuần này đã có (do luật hoặc AI)
 * -> 200 và trả lộ trình cũ mà KHÔNG gọi AI. Lỗi AI -> mã chuẩn hóa, không tạo lộ trình, không chuyển sang luật.
 */
export const createMyAiLearningPathHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    const { created, path } = await createCurrentPathWithAi(req.user.id);
    return success(res, path, created ? 201 : 200);
  } catch (error) {
    if (error instanceof NoExercisesAvailableError) {
      return failure(
        res,
        "NO_EXERCISES_AVAILABLE",
        "Hiện chưa có bài phù hợp để tạo lộ trình. Bạn hãy quay lại sau khi có thêm bài mới.",
        422
      );
    }
    if (
      error instanceof AIQuotaExceededError ||
      error instanceof AIInvalidFormatError ||
      error instanceof AIServiceError
    ) {
      return failure(res, error.code, error.message, error.statusCode);
    }
    return next(error);
  }
};

/**
 * PATCH /learning-path/items/:itemId: tick/bỏ tick thủ công. Trả cả lộ trình (cùng dạng GET) để client cập nhật progress.
 * Item không tồn tại và item của HS khác trả CÙNG 404, cùng mã, cùng thông báo (Project.md 4c mục 10).
 */
export const updateLearningPathItemHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    const { itemId } = res.locals.params as ItemIdParam; // đã qua validateParams
    const { done } = req.body as UpdateItemBody; // đã qua validate
    return success(res, await setItemDone(req.user.id, itemId, done));
  } catch (error) {
    if (error instanceof LearningPathItemNotFoundError) {
      return failure(res, "NOT_FOUND", "Không tìm thấy mục lộ trình", 404);
    }
    return next(error);
  }
};