import { Request, Response, NextFunction } from "express";
import * as assignmentsService from "./assignments.service";
import { success, failure } from "../../utils/response";
import type {
  AssignmentIdParam,
  ListAssignmentsQuery,
} from "./assignments.schema";

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

// POST /api/v1/assignments
// req.body đã qua validate(createAssignmentSchema): dueAt đã là Date, remindBeforeHours đã bỏ trùng.
// assigned_by_id lấy từ JWT (req.user), không nhận từ client.
export const createAssignment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const result = await assignmentsService.createAssignment(
      req.user,
      req.body
    );

    return success(res, result, 201);
  } catch (error) {
    handleError(error, res, next);
  }
};

// GET /api/v1/assignments
// res.locals.query đã qua validateQuery(listAssignmentsQuerySchema): số đã đổi kiểu, có page/limit mặc định.
// student_id / teacher_id lấy từ JWT (req.user), không nhận từ client.
export const listAssignments = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const result = await assignmentsService.listAssignments(
      req.user,
      res.locals.query as ListAssignmentsQuery
    );

    return success(res, result);
  } catch (error) {
    handleError(error, res, next);
  }
};

// GET /api/v1/assignments/:id
// res.locals.params đã qua validateParams(assignmentIdParamSchema): id đã là số nguyên dương.
// student_id lấy từ JWT (req.user): bài giao của lớp khác trả 404, không phải 403.
export const getAssignment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const { id } = res.locals.params as AssignmentIdParam;
    const result = await assignmentsService.getAssignmentDetail(req.user, id);

    return success(res, result);
  } catch (error) {
    handleError(error, res, next);
  }
};

// GET /api/v1/assignments/:id/submissions
// res.locals.params đã qua validateParams(assignmentIdParamSchema). teacher_id lấy từ JWT (req.user):
// bài giao của lớp GV khác trả 404, không phải 403.
export const getSubmissions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const { id } = res.locals.params as AssignmentIdParam;
    const result = await assignmentsService.getSubmissions(req.user, id);

    return success(res, result);
  } catch (error) {
    handleError(error, res, next);
  }
};