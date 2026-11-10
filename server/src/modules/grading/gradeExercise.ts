import type { GradeResult } from "./types";
import { MAX_SCORE } from "./types";
import { getGrader } from "./registry";
import { round2 } from "./utils/score";

/**
 * gradeExercise: hàm vào duy nhất của chấm tự động (hàm thuần, không async, không DB).
 * Lỗi dùng khuôn chung của dự án: Error có statusCode + code, controller đổi
 * thành response { data: null, error: { code, message } }.
 */

/** Dạng bài không chấm tự động (writing, speaking, hoặc type lạ). */
export const NOT_AUTO_GRADABLE_CODE = "NOT_AUTO_GRADABLE";
export const NOT_AUTO_GRADABLE_STATUS = 422;

/** Bài làm của học sinh sai hình dạng. Cùng mã với module exercises. */
export const INVALID_STUDENT_ANSWER_CODE = "VALIDATION_ERROR";
export const INVALID_STUDENT_ANSWER_STATUS = 400;

/** Dữ liệu bài trong DB hỏng (answer không phải mảng): lỗi phía máy chủ. */
export const INVALID_EXERCISE_DATA_CODE = "INVALID_EXERCISE_DATA";

const gradingError = (statusCode: number, code: string, message: string) =>
  Object.assign(new Error(message), { statusCode, code });

/** Làm tròn 2 chữ số thập phân (định nghĩa ở utils/score.ts, export lại để không đổi import cũ). */
export { round2 };

const describeType = (type: unknown): string =>
  typeof type === "string" ? type.slice(0, 50) : "không xác định";

export function gradeExercise(
  type: unknown,
  content: unknown,
  answer: unknown,
  studentAnswer: unknown
): GradeResult {
  const entry = getGrader(type);
  if (!entry) {
    throw gradingError(
      NOT_AUTO_GRADABLE_STATUS,
      NOT_AUTO_GRADABLE_CODE,
      `Dạng bài này không chấm tự động (dạng: ${describeType(type)})`
    );
  }

  if (!Array.isArray(answer)) {
    throw gradingError(
      500,
      INVALID_EXERCISE_DATA_CODE,
      "Đáp án của bài tập không hợp lệ, không thể chấm"
    );
  }

  const parsed = entry.parseStudentAnswer(studentAnswer, answer.length);
  if (!parsed.success) {
    throw gradingError(
      INVALID_STUDENT_ANSWER_STATUS,
      INVALID_STUDENT_ANSWER_CODE,
      `Bài làm không hợp lệ: ${parsed.message}`
    );
  }

  const result = entry.grade(content, answer, parsed.data);

  // Chuẩn hóa điểm: làm tròn 2 chữ số, nằm trong [0, 10]
  return {
    ...result,
    score: Math.min(MAX_SCORE, Math.max(0, round2(result.score))),
    maxScore: MAX_SCORE,
  };
}