import { formatDate, formatTime } from "../../../utils/format";
import { compareAnswer } from "../../exercises/answerUtils";
import { fromPayloadFor, isAnswerableType } from "../../exercises/registry";
import type { AnswerableExerciseType, ExerciseContentMap } from "../../../types/exercise";
import type { AttemptReview } from "../../../types/attemptReview";

/** Đọc điểm người dùng gõ (chấp nhận dấu phẩy "7,5"). Trả NaN nếu rỗng hoặc không phải số. */
export function parseScore(raw: string): number {
  const s = raw.trim().replace(",", ".");
  if (s === "") return Number.NaN;
  return Number(s);
}
export const isValidScore = (n: number) => Number.isFinite(n) && n >= 0 && n <= 10;

/** Làm tròn 2 chữ số thập phân, đúng như backend lưu */
export const round2 = (n: number) => Math.round(n * 100) / 100;

export const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${formatTime(d)}, ${formatDate(d)}`;
};

/** Bài Viết/Nói do AI chấm (có tiêu chí, nhận xét); các dạng còn lại chấm tự động */
export const isAiGradedType = (type: string) => type === "writing" || type === "speaking";

/** Đúng/sai từng ý của bài chấm tự động (so bài làm với đáp án đúng); rỗng nếu không có đáp án */
export function autoVerdict(review: AttemptReview): boolean[] {
  const { type, content, answer } = review.exercise;
  if (!isAnswerableType(type) || isAiGradedType(type) || answer === null || answer === undefined) return [];
  const t = type as AnswerableExerciseType;
  const c = content as ExerciseContentMap[AnswerableExerciseType];
  return compareAnswer(t, fromPayloadFor(t, review.submitted_answer, c as never) as never, fromPayloadFor(t, answer, c as never) as never);
}

// Dùng chung với trang kết quả của học sinh: xem features/exercises/shared và answerUtils
export { formatScore } from "../../exercises/shared/scoreFormat";
export { countWords } from "../../exercises/answerUtils";
