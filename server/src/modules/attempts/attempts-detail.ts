import { round2, type AttemptResult } from "./attempt-result";
import { finalScoreOf } from "./attempt-list";

/**
 * Phần LOGIC THUẦN của GET /attempts/:id (không đụng DB, nên test được riêng).
 *
 * Việc dựng kết quả (score, correct, total, errors, và answer/explanation khi được lộ)
 * do buildAttemptResult làm: file này KHÔNG viết lại logic đó, chỉ ghép thêm các field
 * của riêng trang chi tiết (bài làm của HS, điểm cuối, nhận xét GV...).
 */

/**
 * Quy tắc lộ đáp án (Project.md 4c.4):
 *  - tự luyện (assignment_id null): lộ ngay;
 *  - bài giao: chỉ lộ khi now > due_at (đúng hạn chót thì CHƯA lộ, giống lúc nộp bài).
 * Không rõ hạn của bài giao (dueAt null) thì KHÔNG lộ: sai thì sai về phía an toàn.
 */
export const isAnswerRevealed = (
  assignmentId: number | null,
  dueAt: Date | null,
  now: Date
): boolean => {
  if (assignmentId === null) return true;
  return dueAt !== null && now.getTime() > dueAt.getTime();
};

/** Các cột của attempts mà trang chi tiết cần (object Prisma có thừa field thì bị bỏ). */
export interface AttemptDetailRow {
  exerciseId: number;
  assignmentId: number | null;
  mode: string;
  /** Bài làm của HS (chính HS này nộp) nên luôn được trả về. */
  answer: unknown;
  score: number | null;
  teacherScore: number | null;
  teacherComment: string | null;
  isLate: boolean;
  submittedAt: Date;
}

export type AttemptDetail = AttemptResult & {
  exerciseId: number;
  assignmentId: number | null;
  mode: string;
  /** Lần nộp thứ mấy trong cùng bài giao (hoặc cùng bài tự luyện), bắt đầu từ 1. */
  attemptNo: number;
  /**
   * Bài làm của HS. Cố ý KHÔNG đặt tên `answer`: key `answer` đã dành cho
   * ĐÁP ÁN ĐÚNG (do buildAttemptResult trả, chỉ có khi được lộ).
   */
  submittedAnswer: unknown;
  teacherScore: number | null;
  /** COALESCE(teacher_score, score). */
  finalScore: number | null;
  teacherComment: string | null;
  isLate: boolean;
  submittedAt: Date;
};

const roundOrNull = (value: number | null): number | null =>
  value === null ? null : round2(value);

export const buildAttemptDetail = (input: {
  attempt: AttemptDetailRow;
  result: AttemptResult;
  attemptNo: number;
}): AttemptDetail => {
  const { attempt, result, attemptNo } = input;
  return {
    // result đã là danh sách trắng và đã lo chuyện lộ/không lộ: giữ nguyên.
    ...result,
    exerciseId: attempt.exerciseId,
    assignmentId: attempt.assignmentId,
    mode: attempt.mode,
    attemptNo,
    submittedAnswer: attempt.answer,
    teacherScore: roundOrNull(attempt.teacherScore),
    finalScore: roundOrNull(finalScoreOf(attempt.score, attempt.teacherScore)),
    teacherComment: attempt.teacherComment,
    isLate: attempt.isLate,
    submittedAt: attempt.submittedAt,
  };
};