import { Request, Response, NextFunction } from "express";
import { failure } from "../utils/response";

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error(err);

  return failure(
    res,
    "INTERNAL_SERVER_ERROR",
    "Đã xảy ra lỗi từ máy chủ",
    500
  );
};