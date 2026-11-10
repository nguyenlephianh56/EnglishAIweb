import { Request, Response, NextFunction } from "express";
import * as exercisesService from "./exercises.service";
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

// POST /api/v1/exercises
// req.body đã qua validate(createExerciseSchema): đã trim, đã bỏ field thừa.
// content/answer sẽ được service kiểm tiếp bằng T1.
export const createExercise = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const created = await exercisesService.createExercise(req.user, req.body);

    return success(res, created, 201);
  } catch (error) {
    handleError(error, res, next);
  }
};