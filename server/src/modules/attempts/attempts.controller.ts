import { Request, Response, NextFunction } from "express";
import * as attemptsService from "./attempts.service";
import { success, failure } from "../../utils/response";

// Lỗi nghiệp vụ (có statusCode + code) -> response chuẩn; lỗi lạ -> errorHandler (500)
const handleError = (error: unknown, res: Response, next: NextFunction) => {
  const err = error as Error & {
    statusCode?: number;
    code?: string;
  };

  if (err.statusCode && err.code) {
    return failure(res, err.code, err.message, err.statusCode);
  }

  next(error);
};

// POST /api/v1/attempts
// req.body đã qua validate(createAttemptSchema): chỉ còn exerciseId, answer, mode
// (field thừa như studentId/score/errors đã bị bỏ). student_id lấy từ JWT (req.user).
export const createAttempt = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

   const result = await attemptsService.submitAttempt(

      req.user,
      req.body
    );

    return success(res, result, 201);
  } catch (error) {
    handleError(error, res, next);
  }
};