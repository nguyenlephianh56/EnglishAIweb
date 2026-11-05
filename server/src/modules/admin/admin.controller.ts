//nhận request, kiểm tra :id và query bằng schema,gọi service, rồi trả response.
import { Request, Response, NextFunction } from "express";
import * as adminService from "./admin.service";
import { userIdParamSchema, listUsersQuerySchema } from "./admin.schema";
import { success, failure } from "../../utils/response";

// Chuyển lỗi có statusCode + code thành response chuẩn,
// lỗi lạ thì giao cho errorHandler (trả 500)
const handleError = (
  error: unknown,
  res: Response,
  next: NextFunction
) => {
  const err = error as Error & {
    statusCode?: number;
    code?: string;
  };

  if (err.statusCode && err.code) {
    return failure(res, err.code, err.message, err.statusCode);
  }

  next(error);
};

// Đọc và kiểm tra :id trên URL. Sai thì trả 400 và trả về null
const parseId = (req: Request, res: Response): number | null => {
  const result = userIdParamSchema.safeParse(req.params);

  if (!result.success) {
    failure(
      res,
      "VALIDATION_ERROR",
      result.error.issues.map((issue) => issue.message).join(", "),
      400
    );
    return null;
  }

  return result.data.id;
};

// GET /api/v1/admin/users?role=&status=
export const listUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = listUsersQuerySchema.safeParse(req.query);

    if (!result.success) {
      return failure(
        res,
        "VALIDATION_ERROR",
        result.error.issues.map((issue) => issue.message).join(", "),
        400
      );
    }

    const users = await adminService.listUsers(result.data);

    return success(res, users);
  } catch (error) {
    handleError(error, res, next);
  }
};

// PATCH /api/v1/admin/users/:id/approve
export const approveTeacher = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;

    const user = await adminService.approveTeacher(id);

    return success(res, user);
  } catch (error) {
    handleError(error, res, next);
  }
};

// PATCH /api/v1/admin/users/:id/lock
export const lockUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const id = parseId(req, res);
    if (id === null) return;

    const user = await adminService.lockUser(id, req.user.id);

    return success(res, user);
  } catch (error) {
    handleError(error, res, next);
  }
};

// PATCH /api/v1/admin/users/:id/unlock
export const unlockUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;

    const user = await adminService.unlockUser(id);

    return success(res, user);
  } catch (error) {
    handleError(error, res, next);
  }
};