import { Request, Response, NextFunction } from "express";
import { failure } from "../utils/response";
import { AIQuotaExceededError, AIUsageCheckError } from "../ai/ai.types";
import { AudioUploadError } from "../modules/attempts/attempts.audio.errors";
// Chỉ các lỗi đã biết (message cố định, không chứa dữ liệu nội bộ) mới được trả đúng code/status.
// Lỗi lạ vẫn trả 500 chung, không lộ chi tiết.
const isKnownAppError = (
  err: unknown
): err is AIQuotaExceededError | AIUsageCheckError | AudioUploadError =>
  err instanceof AIQuotaExceededError ||
  err instanceof AIUsageCheckError ||
  err instanceof AudioUploadError;

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (isKnownAppError(err)) {
    return failure(res, err.code, err.message, err.statusCode);
  }

  console.error("INTERNAL_SERVER_ERROR");

  return failure(
    res,
    "INTERNAL_SERVER_ERROR",
    "Đã xảy ra lỗi từ máy chủ",
    500
  );
};
