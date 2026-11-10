import type { Grader } from "../types";
import { MAX_SCORE } from "../types";

/**
 * TODO (việc con sau): chấm điền từ thật.
 * So khớp từng chỗ trống: trim đầu/cuối, KHÔNG phân biệt hoa/thường (Project.md 4c.1);
 * bỏ trống (null hoặc "") tính sai; điểm = đúng/tổng × 10.
 *
 * Dùng chung cho fill_blank và listening_fill (cùng cách chấm, chỉ dùng answer
 * nên không phụ thuộc content).
 *
 * STUB: hiện luôn trả điểm 0, chưa cài đặt.
 */
export const gradeFillBlank: Grader<"fill_blank" | "listening_fill"> = (
  _content,
  answer,
  _studentAnswer
) => ({
  score: 0,
  maxScore: MAX_SCORE,
  correct: 0,
  total: answer.length,
  errors: [],
});