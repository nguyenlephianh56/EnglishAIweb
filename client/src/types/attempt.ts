import type { CefrLevel } from "./student";
import type { LibrarySkill } from "./library";
import type { AssignmentStatus } from "./assignments";

/** Một lỗi AI/chấm tự động tìm thấy. correction/explanation chỉ có khi đáp án được lộ (bài giao: sau hạn nộp). */
export interface AttemptError {
  /** Bài Viết: "nhóm:chi tiết" viết thường, ví dụ "grammar:tense" */
  type: string;
  text: string;
  correction?: string;
  explanation?: string;
}

export interface AttemptCriteria {
  content: number;
  coherence: number;
  vocabulary: number;
  grammar: number;
}

/** Kết quả một lần nộp. Backend KHÔNG trả đúng/sai từng câu: tự suy ra bằng compareAnswer khi có `answer`. */
export interface AttemptResult {
  attemptId: number;
  /** null = bài Viết đang chờ chấm */
  score: number | null;
  maxScore: number;
  graded: boolean;
  correct: number;
  total: number;
  errors: AttemptError[];
  criteria?: AttemptCriteria;
  /** Nhận xét tiếng Việt của AI (bài Viết đã chấm) */
  comment?: string;
  /** ĐÁP ÁN ĐÚNG, chỉ có khi được lộ (tự luyện: ngay; bài giao: sau hạn nộp) */
  answer?: unknown;
  explanation?: string | null;
}

/** Thêm vào kết quả khi nộp bài giao */
export interface AssignmentAttemptExtras {
  attemptNo: number;
  attemptsLeft: number;
}

/** Lỗi AI khi chấm bài Viết: bài ĐÃ được lưu nhưng chưa có điểm */
export interface GradingError {
  code: string;
  message: string;
}

export interface SubmitAttemptBody {
  exerciseId?: number;
  assignmentId?: number;
  /** Đúng dạng backend nhận (xem registry.toPayload) */
  answer: unknown;
}

/** Kết quả POST /attempts (và POST /attempts/:id/regrade) sau khi gộp hai dạng 200/201 và 202 */
export interface SubmitOutcome {
  result: AttemptResult & Partial<AssignmentAttemptExtras>;
  /** Có khi backend trả 202: bài đã lưu nhưng AI chấm lỗi */
  gradingError?: GradingError;
}

/** GET /attempts/:id */
export interface AttemptDetail extends AttemptResult {
  exerciseId: number;
  assignmentId: number | null;
  mode: string;
  attemptNo: number;
  /** Bài làm của học sinh (key `answer` dành cho đáp án đúng) */
  submittedAnswer: unknown;
  teacherScore: number | null;
  /** COALESCE(teacherScore, score) */
  finalScore: number | null;
  teacherComment: string | null;
  isLate: boolean;
  submittedAt: string;
}

/** Đề bài học sinh nhận được (không có đáp án) */
export interface StudentExercise {
  id: number;
  type: string;
  skill: LibrarySkill;
  level: CefrLevel;
  topic: string;
  content: unknown;
  /** Chỉ có khi được lộ (bài giao sau hạn nộp) */
  explanation?: string | null;
}

/** GET /assignments/:id */
export interface StudentAssignmentDetail {
  assignmentId: number;
  class: { id: number; name: string };
  dueAt: string;
  status: AssignmentStatus;
  attemptsUsed: number;
  maxAttempts: number;
  bestScore: number | null;
  lateSubmission: boolean;
  exercise: StudentExercise;
}
