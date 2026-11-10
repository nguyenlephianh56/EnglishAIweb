import type { GradeError, GradeResult } from "../types";
import { MAX_SCORE } from "../types";
import { isSameText } from "./normalize";
import { calcScore } from "./score";

/**
 * Chấm một mảng chỗ trống (hàm thuần): dùng chung cho fill_blank và listening_fill.
 * Chỉ khác nhau ở `errorType` (nhóm lỗi dùng để thống kê).
 *
 * - Duyệt theo độ dài `answer` (đáp án của GV); bài làm thiếu phần tử = bỏ trống = sai,
 *   phần tử thừa bị bỏ qua. Không bao giờ ném lỗi vì bài làm sai.
 * - errors[]: { type, text: bài làm của HS (đã trim, "" nếu bỏ trống), correction: đáp án }.
 */
export function gradeBlanks(
  answer: readonly string[],
  studentAnswer: readonly (string | null | undefined)[] | null | undefined,
  errorType: string
): GradeResult {
  const student = Array.isArray(studentAnswer) ? studentAnswer : [];
  const errors: GradeError[] = [];
  let correct = 0;

  answer.forEach((expected, index) => {
    const given = student[index];
    if (isSameText(given, expected)) {
      correct += 1;
    } else {
      errors.push({
        type: errorType,
        text: typeof given === "string" ? given.trim() : "",
        correction: expected,
      });
    }
  });

  return {
    score: calcScore(correct, answer.length),
    maxScore: MAX_SCORE,
    correct,
    total: answer.length,
    errors,
  };
}
