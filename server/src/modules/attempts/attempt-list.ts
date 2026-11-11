import { round2 } from "./attempt-result";

/**
 * Phần LOGIC THUẦN của GET /attempts (không đụng DB, nên test được riêng).
 *
 * Quy tắc (Project.md 4 + 4c.3): điểm cuối = COALESCE(teacher_score, score).
 * Dùng `??` (không dùng `||`) để teacher_score = 0 vẫn được tính là điểm cuối.
 *
 * Danh sách KHÔNG BAO GIỜ chứa đáp án đúng / explanation / errors / bài làm:
 * hàm toAttemptListItem tự chọn từng field (danh sách trắng) nên field mới của bảng
 * attempts không tự lọt ra.
 */

/** Các cột của attempts mà danh sách cần (Prisma có thể trả nhiều hơn, thừa sẽ bị bỏ). */
export interface AttemptListRow {
  id: number;
  exerciseId: number;
  assignmentId: number | null;
  mode: string;
  score: number | null;
  maxScore: number;
  teacherScore: number | null;
  isLate: boolean;
  submittedAt: Date;
}

export interface AttemptListItem {
  id: number;
  exerciseId: number;
  assignmentId: number | null;
  mode: string;
  /** Lần nộp thứ mấy trong cùng bài giao (hoặc cùng bài tự luyện), bắt đầu từ 1. */
  attemptNo: number;
  score: number | null;
  maxScore: number;
  teacherScore: number | null;
  /** COALESCE(teacher_score, score). */
  finalScore: number | null;
  isLate: boolean;
  submittedAt: Date;
}

export interface AttemptListResponse {
  items: AttemptListItem[];
  page: number;
  limit: number;
  /** Tổng số dòng khớp bộ lọc (toàn bộ, không chỉ trang này). */
  total: number;
  /** finalScore cao nhất trong TOÀN BỘ kết quả khớp lọc. null nếu không lọc hoặc chưa có điểm. */
  bestScore: number | null;
  /** Số lần nộp khớp lọc. null nếu không lọc theo assignmentId/exerciseId. */
  attemptsCount: number | null;
}

const roundOrNull = (value: number | null): number | null =>
  value === null ? null : round2(value);

/** Điểm cuối của một lần nộp (chưa làm tròn). */
export const finalScoreOf = (
  score: number | null,
  teacherScore: number | null
): number | null => teacherScore ?? score;

/** bestScore / attemptsCount chỉ có nghĩa khi đang xem MỘT bài hoặc MỘT bài giao. */
export const hasHistoryFilter = (query: {
  assignmentId?: number;
  exerciseId?: number;
}): boolean =>
  query.assignmentId !== undefined || query.exerciseId !== undefined;

export const toAttemptListItem = (
  row: AttemptListRow,
  attemptNo: number
): AttemptListItem => ({
  id: row.id,
  exerciseId: row.exerciseId,
  assignmentId: row.assignmentId,
  mode: row.mode,
  attemptNo,
  score: roundOrNull(row.score),
  maxScore: row.maxScore,
  teacherScore: roundOrNull(row.teacherScore),
  finalScore: roundOrNull(finalScoreOf(row.score, row.teacherScore)),
  isLate: row.isLate,
  submittedAt: row.submittedAt,
});

export const buildAttemptListResponse = (input: {
  items: AttemptListItem[];
  page: number;
  limit: number;
  total: number;
  best: number | null;
  filtered: boolean;
}): AttemptListResponse => ({
  items: input.items,
  page: input.page,
  limit: input.limit,
  total: input.total,
  bestScore: input.filtered ? roundOrNull(input.best) : null,
  attemptsCount: input.filtered ? input.total : null,
});