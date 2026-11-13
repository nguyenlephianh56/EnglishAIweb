import type { Request, Response, NextFunction } from "express";
import * as generateService from "./exercises.generate.service";
import { failure } from "../../utils/response";

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

    await generateService.generateExercise(req.user, req.body);
  } catch (error) {
    if (error instanceof generateService.GenerateExerciseNotImplementedError) {
      return failure(res, error.code, error.message, error.statusCode);
    }

    // errorHandler có log lỗi: chỉ chuyển mã cố định, tránh log nội dung người dùng.
    return next(new Error("EXERCISE_GENERATE_FAILED"));
  }
};