import type { Request, Response, NextFunction } from "express";
import * as generateService from "./exercises.generate.service";
import { success, failure } from "../../utils/response";
import { AIQuotaExceededError, AIUsageCheckError } from "../../ai/ai.types";
import { AIInvalidFormatError } from "../../ai/json";
import { AIServiceError } from "../../ai/resilience";

// POST /api/v1/exercises/generate — body đã qua Zod, user đã qua quyền và quota.
export const generateExercise = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const created = await generateService.generateExercise(req.user, req.body);

    return success(res, created, 201);
  } catch (error) {
    // Chỉ 4 lỗi AI đã biết (message cố định, không chứa nội dung bài) mới trả đúng mã:
    // 429 hết lượt/quá tải, 503 không kiểm được lượt, 502 sai khuôn/AI lỗi, 504 timeout.
    if (
      error instanceof AIQuotaExceededError ||
      error instanceof AIUsageCheckError ||
      error instanceof AIInvalidFormatError ||
      error instanceof AIServiceError
    ) {
      return failure(res, error.code, error.message, error.statusCode);
    }

    // Mọi lỗi khác (kể cả lỗi lưu DB): errorHandler trả 500 chung, không lộ chi tiết.
    // Đổi sang mã cố định để console.error không in dữ liệu của Prisma (có thể chứa nội dung bài).
    return next(new Error("EXERCISE_GENERATE_FAILED"));
  }
};