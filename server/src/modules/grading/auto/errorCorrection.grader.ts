import type { Grader } from "../types";
import { MAX_SCORE } from "../types";

/**
 * TODO (việc con sau): chấm sửa lỗi thật.
 * studentAnswer có đúng 1 phần tử (bản sửa cho phần `wrong`); so với answer[0]
 * (trim, không phân biệt hoa/thường); sai thì sinh errors[] {type, text, correction}.
 *
 * STUB: hiện luôn trả điểm 0, chưa cài đặt.
 */
export const gradeErrorCorrection: Grader<"error_correction"> = (
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