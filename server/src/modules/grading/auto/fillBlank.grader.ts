import type { Grader } from "../types";
import { gradeBlanks } from "../utils/gradeBlanks";

/** Nhóm lỗi của fill_blank (quy tắc "nhóm:chi_tiết", Project.md 4b). */
export const FILL_BLANK_ERROR_TYPE = "foundation:wrong_blank";

/**
 * Chấm điền từ: so từng chỗ trống với answer cùng vị trí, trim đầu/cuối,
 * gộp khoảng trắng giữa, không phân biệt hoa/thường (xem utils/normalize.ts).
 * Bỏ trống (null, "" hoặc thiếu phần tử) tính sai. Điểm = đúng/tổng × 10.
 * Chỉ dùng `answer`, không phụ thuộc `content`.
 */
export const gradeFillBlank: Grader<"fill_blank"> = (
  _content,
  answer,
  studentAnswer
) => gradeBlanks(answer, studentAnswer, FILL_BLANK_ERROR_TYPE);
