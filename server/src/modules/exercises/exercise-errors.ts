import type { Response } from "express";
import { failure } from "../../utils/response";
import type { ExerciseValidationError } from "./validate-exercise";

/**
 * Tiện ích để T2 (controller) trả lỗi 400 khi validateExercise thất bại.
 * Dùng đúng khuôn response hiện có: { data: null, error: { code, message } }.
 *
 * Cách dùng trong controller:
 *   const result = validateExercise(type, content, answer);
 *   if (!result.success) return sendExerciseValidationError(res, result.errors);
 *   // result.data.content / result.data.answer đã trim, lưu bằng Prisma
 */

/** Mã lỗi giống middleware validate hiện có. */
export const EXERCISE_VALIDATION_ERROR_CODE = "VALIDATION_ERROR";

/** Chỉ hiện tối đa chừng này lỗi trong message để response không quá dài. */
export const MAX_ERRORS_IN_MESSAGE = 10;

/**
 * Gộp danh sách lỗi thành một chuỗi, mỗi lỗi dạng "đường_dẫn: thông báo",
 * ngăn cách bằng "; ". Ví dụ:
 *   "content.questions[0].options: Cần ít nhất 2 phần tử; answer: Số đáp án (1) phải bằng ..."
 */
export function formatValidationErrors(errors: ExerciseValidationError[]): string {
  if (errors.length === 0) return "Dữ liệu bài tập không hợp lệ";

  const shown = errors
    .slice(0, MAX_ERRORS_IN_MESSAGE)
    .map((error) => `${error.path}: ${error.message}`);

  const hidden = errors.length - shown.length;
  if (hidden > 0) shown.push(`(và ${hidden} lỗi khác)`);

  return shown.join("; ");
}

/** Trả HTTP 400 VALIDATION_ERROR kèm message có đường dẫn field. */
export function sendExerciseValidationError(
  res: Response,
  errors: ExerciseValidationError[]
) {
  return failure(
    res,
    EXERCISE_VALIDATION_ERROR_CODE,
    formatValidationErrors(errors),
    400
  );
}