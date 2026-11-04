import { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { failure } from "../utils/response";

export const requireRole = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return failure(
        res,
        "UNAUTHORIZED",
        "Vui lòng đăng nhập",
        401
      );
    }

    if (!roles.includes(req.user.role)) {
      return failure(
        res,
        "FORBIDDEN",
        "Bạn không có quyền truy cập chức năng này",
        403
      );
    }

    next();
  };
};