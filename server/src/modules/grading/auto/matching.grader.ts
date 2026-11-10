// TODO: ham cham tu dong dang matching
import type { Grader } from "../types";
import { MAX_SCORE } from "../types";

/**
 * TODO (việc con sau): chấm nối cặp thật.
 * Điểm = số cặp đúng / tổng cặp × 10 (Project.md 4c.2). studentAnswer chỉ gồm
 * các cặp đã nối (0..n cặp); cặp chưa nối tính sai.
 *
 * STUB: hiện luôn trả điểm 0, chưa cài đặt.
 */
export const gradeMatching: Grader<"matching"> = (
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