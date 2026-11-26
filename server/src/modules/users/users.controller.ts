import type { NextFunction, Request, Response } from "express";
import { failure, success } from "../../utils/response";
import * as usersService from "./users.service";

const passwordErrors = {
  unavailable: {
    status: 403,
    code: "FORBIDDEN",
    message: "Tài khoản không tồn tại hoặc chưa được kích hoạt",
  },
  invalidCurrent: {
    status: 400,
    code: "INVALID_CURRENT_PASSWORD",
    message: "Mật khẩu hiện tại không chính xác",
  },
  unchanged: {
    status: 400,
    code: "PASSWORD_UNCHANGED",
    message: "Mật khẩu mới phải khác mật khẩu hiện tại",
  },
  conflict: {
    status: 409,
    code: "PASSWORD_CHANGE_CONFLICT",
    message: "Thông tin tài khoản vừa thay đổi. Vui lòng thử lại.",
  },
};

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
  }

  try {
    const result = await usersService.changePassword(req.user.id, req.body);
    if (result === "changed") return success(res, null);

    const { code, message, status } = passwordErrors[result];
    return failure(res, code, message, status);
  } catch (error) {
    return next(error);
  }
}