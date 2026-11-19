import axios from "axios";
import { getErrorCode } from "../../../api/client";

/**
 * Lỗi do AI hoặc mạng (không phải lỗi người dùng): mất kết nối, lỗi máy chủ 5xx, hoặc mã AI_* trừ hết lượt AI trong ngày.
 * Với các lỗi này bài Viết có thể đã được lưu, nên cho "Thử nộp lại".
 */
export function isAiOrNetworkError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (!error.response) return true;
  if (error.response.status >= 500) return true;
  const code = getErrorCode(error);
  return Boolean(code && code.startsWith("AI_") && code !== "AI_QUOTA_EXCEEDED");
}
