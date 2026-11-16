// =====================================================================
// attempts/attempts-grading-error.ts — Đổi lỗi AI khi chấm Viết thành `gradingError` cho HS (T13).
//
// Dùng khi attempt ĐÃ LƯU nhưng AI chấm thất bại: bài không mất, HS nhận phản hồi "đã lưu,
// chưa chấm" + lý do thân thiện. Chỉ nhận diện các lỗi AI đã biết (instanceof); lỗi khác
// (DB, lỗi lập trình...) trả null để nơi gọi ném lại như cũ.
//
// Bảo mật: message cố định tiếng Việt, KHÔNG lấy message/stack/cause của lỗi gốc, không chứa
// nội dung bài viết, prompt, phản hồi thô hay chi tiết nội bộ.
// =====================================================================
import { AIQuotaExceededError, AIUsageCheckError } from "../../ai/ai.types";
import { AIInvalidFormatError } from "../../ai/json";
import { AIServiceError } from "../../ai/resilience";

export interface GradingError {
  code: string;
  message: string;
}

const SAVED = "Bài của bạn đã được lưu nhưng chưa được chấm.";

/** Lý do theo mã lỗi. Mã lạ (nếu sau này thêm) dùng câu "lỗi tạm thời". */
const TEMPORARY = `${SAVED} Hệ thống chấm đang gặp lỗi tạm thời, bạn thử chấm lại sau nhé.`;

const GRADING_ERROR_MESSAGES: Record<string, string> = {
  AI_QUOTA_EXCEEDED: `${SAVED} Bạn đã dùng hết lượt chấm AI hôm nay, hãy quay lại chấm lại vào ngày mai.`,
  RATE_LIMITED: `${SAVED} AI đang bận, bạn thử chấm lại sau ít phút nhé.`,
  TIMEOUT: `${SAVED} AI phản hồi quá lâu (hết thời gian chờ), bạn thử chấm lại nhé.`,
  AI_UNAVAILABLE: TEMPORARY,
  AI_INVALID_FORMAT: TEMPORARY,
  AI_ERROR: TEMPORARY,
  AI_USAGE_CHECK_FAILED: TEMPORARY,
};

/**
 * Lỗi AI -> { code, message } an toàn để trả cho HS; không phải lỗi AI -> null.
 * `code` lấy từ lỗi gốc (chỉ là mã ổn định như RATE_LIMITED), message do mình viết ở trên.
 */
export const toGradingError = (error: unknown): GradingError | null => {
  if (
    error instanceof AIQuotaExceededError ||
    error instanceof AIUsageCheckError ||
    error instanceof AIInvalidFormatError ||
    error instanceof AIServiceError
  ) {
    return {
      code: error.code,
      message: GRADING_ERROR_MESSAGES[error.code] ?? TEMPORARY,
    };
  }
  return null;
};