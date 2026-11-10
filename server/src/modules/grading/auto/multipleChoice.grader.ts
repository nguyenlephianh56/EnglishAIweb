import type { Grader } from "../types";
import { MAX_SCORE } from "../types";

/**
 * TODO (việc con sau): chấm trắc nghiệm thật.
 * Mỗi phần tử studentAnswer = vị trí lựa chọn HS chọn (null = bỏ trống, tính sai);
 * so với answer cùng vị trí; điểm = đúng/tổng × 10; sinh errors[] cho câu sai.
 *
 * STUB: hiện luôn trả điểm 0, chưa cài đặt.
 */
export const gradeMultipleChoice: Grader<"multiple_choice"> = (
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