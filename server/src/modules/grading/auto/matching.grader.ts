import type { GradeError, Grader } from "../types";
import { MAX_SCORE } from "../types";
import { calcScore } from "../utils/score";

/** Nhóm lỗi của matching (quy tắc "nhóm:chi_tiết", Project.md 4b). */
export const MATCHING_ERROR_TYPE = "foundation:wrong_match";

/** Mũi tên giữa hai cột khi ghi một cặp thành chữ. */
const ARROW = "→";

/** Một cặp HS nộp hợp lệ về hình dạng: [số nguyên >= 0, số nguyên >= 0]. */
const isIndexPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((v) => typeof v === "number" && Number.isInteger(v) && v >= 0);

/**
 * Chấm nối cặp (Project.md 4c.2): điểm = số cặp đúng / tổng cặp × 10.
 *
 * - Mỗi cặp [left, right] của đáp án là một "ô" để chấm. Ô đúng khi HS có nối
 *   đúng left đó với đúng right đó. Thứ tự các cặp HS nộp không quan trọng.
 * - Cặp trùng chỉ số left chỉ tính MỘT lần: lấy cặp đầu tiên của mỗi left,
 *   bỏ các cặp sau (nên không thể nối một left với nhiều right để ăn điểm,
 *   và số cặp đúng không bao giờ vượt tổng).
 * - Chưa nối, cặp sai hình dạng, chỉ số ngoài phạm vi: tính sai, không ném lỗi.
 * - errors[]: mỗi ô sai một lỗi, theo thứ tự answer:
 *   text = "left → right HS nối" ("left → " nếu chưa nối),
 *   correction = "left → right đúng" (cả hai là CHỮ trong content, không phải chỉ số).
 */
export const gradeMatching: Grader<"matching"> = (
  content,
  answer,
  studentAnswer
) => {
  // left -> right mà HS nối (cặp đầu tiên của mỗi left thắng).
  const studentRightOf = new Map<number, number>();
  if (Array.isArray(studentAnswer)) {
    for (const pair of studentAnswer as unknown[]) {
      if (isIndexPair(pair) && !studentRightOf.has(pair[0])) {
        studentRightOf.set(pair[0], pair[1]);
      }
    }
  }

  const leftLabel = (index: number) => content?.left?.[index] ?? String(index);
  const errors: GradeError[] = [];
  let correct = 0;

  for (const [leftIndex, rightIndex] of answer) {
    const given = studentRightOf.get(leftIndex);
    if (given === rightIndex) {
      correct += 1;
      continue;
    }
    const givenText = given === undefined ? "" : content?.right?.[given] ?? "";
    const rightText = content?.right?.[rightIndex] ?? String(rightIndex);
    errors.push({
      type: MATCHING_ERROR_TYPE,
      text: `${leftLabel(leftIndex)} ${ARROW} ${givenText}`,
      correction: `${leftLabel(leftIndex)} ${ARROW} ${rightText}`,
    });
  }

  return {
    score: calcScore(correct, answer.length),
    maxScore: MAX_SCORE,
    correct,
    total: answer.length,
    errors,
  };
};