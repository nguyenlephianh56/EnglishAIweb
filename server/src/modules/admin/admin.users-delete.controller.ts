import type { NextFunction, Request, Response } from "express";
import { failure } from "../../utils/response";
import { userIdParamSchema } from "./admin.schema";
import { deleteUser } from "./admin.users-delete.service";

export async function deleteUserHandler(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);

  const params = userIdParamSchema.safeParse(req.params);
  if (!params.success) {
    const message = params.error.issues.map((issue) => issue.message).join(", ");
    return failure(res, "VALIDATION_ERROR", message, 400);
  }
  if (Number(req.get("Content-Length") ?? "0") > 0 || req.get("Transfer-Encoding")) {
    return failure(res, "VALIDATION_ERROR", "Yêu cầu xóa tài khoản không nhận body", 400);
  }

  try {
    const data = await deleteUser(req.user.id, params.data.id);
    return res.status(200).json({ data });
  } catch (error) {
    if (error instanceof Error && "statusCode" in error && "code" in error) {
      const { statusCode, code, message } = error;
      if ((statusCode === 403 || statusCode === 404 || statusCode === 409) && typeof code === "string") {
        return failure(res, code, message, statusCode);
      }
    }
    return next(error);
  }
}