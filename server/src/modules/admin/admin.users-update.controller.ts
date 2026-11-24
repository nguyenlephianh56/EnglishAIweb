import { Request, Response, NextFunction } from "express";
import { userIdParamSchema } from "./admin.schema";
import type { UpdateUserBody } from "./admin.users-update.schema";
import { updateUser } from "./admin.users-update.service";
import { success, failure } from "../../utils/response";

// PATCH /api/v1/admin/users/:id   body { name?, email? }
// Body đã được validate(updateUserBodySchema) ở route kiểm tra (strict, trim, chữ thường)
// trước khi vào đây, nên req.body ở đây đã sạch.
export const updateUserHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    // Kiểm :id giống các endpoint admin khác: sai định dạng -> 400 VALIDATION_ERROR
    const parsed = userIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      return failure(
        res,
        "VALIDATION_ERROR",
        parsed.error.issues.map((issue) => issue.message).join(", "),
        400
      );
    }

    const user = await updateUser(
      { id: req.user.id, role: req.user.role },
      parsed.data.id,
      req.body as UpdateUserBody
    );

    return success(res, user);
  } catch (error) {
    // Lỗi có statusCode + code (404, 409, 403...) -> response chuẩn;
    // lỗi lạ giao cho errorHandler (500, không lộ chi tiết)
    const err = error as Error & { statusCode?: number; code?: string };
    if (err.statusCode && err.code) {
      return failure(res, err.code, err.message, err.statusCode);
    }
    next(error);
  }
};