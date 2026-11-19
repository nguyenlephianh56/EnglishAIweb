import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { failure } from "../utils/response";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        role: Role;
        status: UserStatus;
      };
    }
  }
}

export const authenticateActiveAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, env.JWT_SECRET);

    if (
      typeof decoded === "string" ||
      typeof decoded.userId !== "number"
    ) {
      return failure(res, "INVALID_TOKEN", "Token không hợp lệ", 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      const status = user ? 403 : 401;
      return failure(
        res,
        status === 403 ? "FORBIDDEN" : "UNAUTHORIZED",
        "Tài khoản không tồn tại hoặc chưa được kích hoạt",
        status
      );
    }

    req.user = user;
    next();
  } catch {
    return failure(res, "INVALID_TOKEN", "Token không hợp lệ hoặc đã hết hạn", 401);
  }
};
