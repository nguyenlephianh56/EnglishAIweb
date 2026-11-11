import { Request, Response, NextFunction } from "express";
import * as attemptsService from "./attempts.service";
import { success, failure } from "../../utils/response";
import type { AttemptIdParam, ListAttemptsQuery } from "./attempts.schema";

// Lỗi nghiệp vụ (có statusCode + code) -> response chuẩn; lỗi lạ -> errorHandler (500)
const handleError = (error: unknown, res: Response, next: NextFunction) => {
    const err = error as Error & {
    statusCode?: number;
    code?: string;
    details?: unknown;     
  };

  if (err.statusCode && err.code) {
    return failure(res, err.code, err.message, err.statusCode, err.details); 
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

// GET /api/v1/attempts
// res.locals.query đã qua validateQuery(listAttemptsQuerySchema): số đã đổi kiểu, có page/limit mặc định.
// student_id lấy từ JWT (req.user), không nhận từ client.
export const listAttempts = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const result = await attemptsService.listAttempts(
      req.user,
      res.locals.query as ListAttemptsQuery
    );

    return success(res, result);
  } catch (error) {
    handleError(error, res, next);
  }
};

// GET /api/v1/attempts/:id
// res.locals.params đã qua validateParams(attemptIdParamSchema): id đã là số nguyên dương.
// student_id lấy từ JWT (req.user): bài nộp của người khác trả 404, không phải 403.
export const getAttempt = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const { id } = res.locals.params as AttemptIdParam;
    const result = await attemptsService.getAttemptDetail(req.user, id);

    return success(res, result);
  } catch (error) {
    handleError(error, res, next);
  }
};