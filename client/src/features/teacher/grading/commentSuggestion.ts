import axios from "axios";
import { getErrorCode, getErrorMessage } from "../../../api/client";
import type { AttemptReview } from "../../../types/attemptReview";

export const COMMENT_MAX = 1000;

/** Chỉ bài Viết/Nói có nội dung chữ (submitted_answer.text) mới gợi ý nhận xét được */
export function canSuggestComment(review: AttemptReview): boolean {
  const { type } = review.exercise;
  if (type !== "writing" && type !== "speaking") return false;
  const answer = review.submitted_answer;
  if (typeof answer !== "object" || answer === null) return false;
  const text = (answer as { text?: unknown }).text;
  return typeof text === "string" && text.trim() !== "";
}

/** Thông báo lỗi tiếng Việt cho POST /attempts/:id/comment-suggestion (theo mã lỗi, rồi theo mã HTTP) */
export function suggestErrorMessage(error: unknown): string {
  const code = getErrorCode(error);
  if (code === "UNSUPPORTED_EXERCISE_TYPE") return "Chỉ gợi ý nhận xét cho bài Viết hoặc bài Nói";
  if (code === "NO_TEXT_TO_COMMENT") return "Bài nộp không có nội dung chữ để nhận xét";
  if (axios.isAxiosError(error)) {
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") return "AI đang bận hoặc quá thời gian, thử lại sau";
    switch (error.response?.status) {
      case 404:
        return "Bài này không thuộc lớp của bạn hoặc không tồn tại";
      case 429:
        return "Bạn đã hết lượt AI hôm nay, thử lại ngày mai";
      case 502:
        return "AI trả sai định dạng, thử lại";
      case 503:
      case 504:
        return "AI đang bận hoặc quá thời gian, thử lại sau";
    }
  }
  return getErrorMessage(error, "Không soạn được nhận xét, vui lòng thử lại.");
}

/** Nối gợi ý vào cuối nhận xét hiện có, cách một dòng trống (không cắt: vượt 1000 ký tự thì bộ đếm báo lỗi) */
export const appendSuggestion = (current: string, suggestion: string): string => (current.trim() === "" ? suggestion : `${current.trimEnd()}\n\n${suggestion}`);
