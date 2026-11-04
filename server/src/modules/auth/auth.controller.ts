
import { Request, Response, NextFunction } from "express";
import * as authService from "./auth.service";
import { success, failure } from "../../utils/response";

// Đăng ký
export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await authService.register(req.body);

    return success(res, user, 201);
  } catch (error) {
    const err = error as Error & {
      statusCode?: number;
      code?: string;
    };

    if (err.statusCode && err.code) {
      return failure(
        res,
        err.code,
        err.message,
        err.statusCode
      );
    }

    next(error);
  }
};

// Đăng nhập
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await authService.login(req.body);

    return success(res, result);
  } catch (error) {
    const err = error as Error & {
      statusCode?: number;
      code?: string;
    };

    if (err.statusCode && err.code) {
      return failure(
        res,
        err.code,
        err.message,
        err.statusCode
      );
    }

    next(error);
  }
};

// Lấy thông tin tài khoản hiện tại
export const me = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(
        res,
        "UNAUTHORIZED",
        "Vui lòng đăng nhập",
        401
      );
    }

    const user = await authService.getMe(req.user.id);

    return success(res, user);
  } catch (error) {
    next(error);
  }
};
