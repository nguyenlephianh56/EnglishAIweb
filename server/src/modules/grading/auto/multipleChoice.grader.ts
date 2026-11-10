import type { GradeError, Grader } from "../types";
import { MAX_SCORE } from "../types";
import { calcScore } from "../utils/score";

/** Nhóm lỗi của multiple_choice (quy tắc "nhóm:chi_tiết", Project.md 4b). */
export const MULTIPLE_CHOICE_ERROR_TYPE = "reading:wrong_choice";

/**
 * Chấm trắc nghiệm: câu i đúng khi studentAnswer[i] === answer[i] (cả hai là vị trí
 * lựa chọn, bắt đầu từ 0). Điểm = đúng/tổng × 10.
 *
 * - null, thiếu phần tử, hoặc vị trí ngoài phạm vi: tính sai (không bao giờ ném lỗi).
 * - errors[] cho mỗi câu sai: text = CHỮ của lựa chọn HS chọn ("" nếu bỏ trống hoặc
 *   chọn ngoài phạm vi), correction = CHỮ của lựa chọn đúng (không phải chỉ số).
 *   Nếu content hỏng (không tìm thấy lựa chọn đúng) thì correction tạm là chỉ số dạng chuỗi.
 */
export const gradeMultipleChoice: Grader<"multiple_choice"> = (
  content,
  answer,
  studentAnswer
) => {
  const student = Array.isArray(studentAnswer) ? studentAnswer : [];
  const errors: GradeError[] = [];
  let correct = 0;

  answer.forEach((rightIndex, index) => {
    const given = student[index];
    if (typeof given === "number" && given === rightIndex) {
      correct += 1;
      return;
    }

    const options = content?.questions?.[index]?.options;
    const chosenText =
      typeof given === "number" && Number.isInteger(given) && given >= 0
        ? options?.[given]
        : undefined;

    errors.push({
      type: MULTIPLE_CHOICE_ERROR_TYPE,
      text: chosenText ?? "",
      correction: options?.[rightIndex] ?? String(rightIndex),
    });
  });

  return {
    score: calcScore(correct, answer.length),
    maxScore: MAX_SCORE,
    correct,
    total: answer.length,
    errors,
  };
};