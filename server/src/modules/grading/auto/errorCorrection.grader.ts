import type { Grader } from "../types";
import { gradeBlanks } from "../utils/gradeBlanks";

/** Nhóm lỗi của error_correction (quy tắc "nhóm:chi_tiết", Project.md 4b). */
export const ERROR_CORRECTION_ERROR_TYPE = "writing:wrong_correction";

/**
 * Chấm sửa lỗi: T1 chốt `answer` có đúng 1 phần tử (bản sửa cho phần `wrong`),
 * bài làm của HS là mảng 1 chuỗi. So bản sửa với answer[0] theo cùng quy tắc chuỗi
 * của fill_blank (trim, gộp khoảng trắng giữa, không phân biệt hoa/thường, bỏ trống = sai).
 *
 * Tổng luôn là 1 câu nên điểm chỉ có 10 hoặc 0. Nếu sai, errors có 1 phần tử:
 * { type, text: bản sửa HS nộp ("" nếu bỏ trống), correction: answer[0] }.
 * Chỉ dùng `answer`, không phụ thuộc `content`.
 */
export const gradeErrorCorrection: Grader<"error_correction"> = (
  _content,
  answer,
  studentAnswer
) => gradeBlanks(answer.slice(0, 1), studentAnswer, ERROR_CORRECTION_ERROR_TYPE);