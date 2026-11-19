import { toStudentView } from "../exercises/exercise-view";

/**
 * Dựng response kết quả một lần nộp. Hàm dùng chung: nộp bài tự luyện (việc này),
 * và sau này nộp bài giao / xem lại lịch sử chỉ cần đổi cờ `reveal`.
 *
 * Quy tắc lộ đáp án (Project.md 4c.4):
 *  - reveal = true  (tự luyện sau khi nộp; bài giao sau due_at): có `answer`,
 *    `explanation` và đủ errors[].correction / errors[].explanation.
 *  - reveal = false (bài giao chưa tới hạn): KHÔNG có key `answer`, `explanation`;
 *    mỗi lỗi chỉ còn { type, text } (bỏ correction và explanation vì chúng nói ra đáp án).
 *
 * Cách làm an toàn: DANH SÁCH TRẮNG (giống toStudentView). Tự chọn từng field trả ra,
 * nên field mới của bảng attempts (studentId, aiFeedback, teacherScore...) không tự lọt ra.
 */

// Chỉ cần các field này; object đầy đủ từ Prisma vẫn truyền vào được.
export interface AttemptForResult {
  id: number;
  score: number | null;
  maxScore: number;
  errors: unknown;
  teacherScore?: number | null;
   aiFeedback?: unknown;
}

export interface ExerciseForResult {
  id: number;
  type: string;
  skill: string;
  level: string;
  topic: string;
  content: unknown;
  answer: unknown;

  explanation?: string | null;
}

export interface ResultError {
  type: string;
  text: string;
  correction?: string;
  explanation?: string;
}

export interface AttemptResult {
  attemptId: number;
  score: number | null;
  maxScore: number;
  /** Số câu/cặp đúng. */
  graded: boolean;
  correct: number;
  /** Tổng số câu/cặp. */
  total: number;
  errors: ResultError[];
  /** Đáp án đúng. Chỉ có khi reveal = true. */
  criteria?: ResultCriteria;
  /** Nhận xét tiếng Việt của AI (chỉ writing đã chấm). Luôn hiện, không phụ thuộc reveal. */
  comment?: string;
  /** Đáp án đúng. Chỉ có khi reveal = true. */
  answer?: unknown;
  /** Giải thích (null nếu bài không có). Chỉ có khi reveal = true. */
  explanation?: string | null;
}

export interface BuildAttemptResultOptions {
  /** true = được lộ đáp án + giải thích (xem 4c.4). Không có mặc định, nơi gọi phải nói rõ. */
  reveal: boolean;
}

export const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;


/**
 * `errors` lưu trong DB là JSON (kiểu lỏng). Đọc lại an toàn: không phải mảng -> [],
 * bỏ phần tử hỏng, chỉ lấy đúng field cần.
 */
function readErrors(raw: unknown, reveal: boolean): ResultError[] {
  if (!Array.isArray(raw)) return [];

  const result: ResultError[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const e = item as Record<string, unknown>;
    if (typeof e.type !== "string") continue;

    const entry: ResultError = {
      type: e.type,
      text: typeof e.text === "string" ? e.text : "",
    };
    if (reveal) {
      entry.correction = typeof e.correction === "string" ? e.correction : "";
      if (typeof e.explanation === "string") entry.explanation = e.explanation;
    }
    result.push(entry);
  }
  return result;
}

/** Tiêu chí bài Viết (4 tiêu chí). */
export interface WritingCriteria {
  content: number;
  coherence: number;
  vocabulary: number;
  grammar: number;
}

/** Tiêu chí bài Nói (3 tiêu chí, T18). */
export interface SpeakingCriteria {
  content: number;
  fluency: number;
  pronunciation: number;
}

export type ResultCriteria = WritingCriteria | SpeakingCriteria;

const WRITING_CRITERIA_KEYS = ["content", "coherence", "vocabulary", "grammar"] as const;
const SPEAKING_CRITERIA_KEYS = ["content", "fluency", "pronunciation"] as const;

/**
 * `ai_feedback` lưu trong DB là JSON lỏng. Đọc lại an toàn bằng danh sách trắng:
 *  - criteria: chỉ lấy khi ĐỦ 4 tiêu chí đều là số hữu hạn (thiếu/hỏng -> bỏ cả criteria);
 *  - comment: chỉ lấy khi là chuỗi không rỗng;
 *  - mọi key khác trong ai_feedback bị bỏ (không lọt ra response).
 */
function readAiFeedback(raw: unknown): { criteria?: ResultCriteria; comment?: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const f = raw as Record<string, unknown>;
  const out: { criteria?: ResultCriteria; comment?: string } = {};

  if (typeof f.criteria === "object" && f.criteria !== null && !Array.isArray(f.criteria)) {
    const c = f.criteria as Record<string, unknown>;
    const isValid = (keys: readonly string[]) =>
      keys.every((k) => typeof c[k] === "number" && Number.isFinite(c[k]));
    if (isValid(WRITING_CRITERIA_KEYS)) {
      out.criteria = {
        content: round2(c.content as number),
        coherence: round2(c.coherence as number),
        vocabulary: round2(c.vocabulary as number),
        grammar: round2(c.grammar as number),
      };
    } else if (isValid(SPEAKING_CRITERIA_KEYS)) {
      // Bài Nói: chỉ 3 tiêu chí. wordIssues không đưa ra riêng vì đã có trong errors[].
      out.criteria = {
        content: round2(c.content as number),
        fluency: round2(c.fluency as number),
        pronunciation: round2(c.pronunciation as number),
      };
    }
  }

  if (typeof f.comment === "string" && f.comment.trim() !== "") {
    out.comment = f.comment;
  }
  return out;
}

/**
 * total = số phần tử của `answer` GV (mọi dạng chấm tự động đều là mảng);
 * correct suy ra từ điểm: score = correct/total × 10 nên correct = score/max × total.
 * Tính từ dữ liệu đã lưu nên dùng lại được cho lịch sử, không cần lưu thêm cột.
 */

function countCorrect(
  score: number | null,
  maxScore: number,
  answer: unknown
): { correct: number; total: number } {
  const total = Array.isArray(answer) ? answer.length : 0;
  if (total === 0 || score === null || maxScore <= 0) return { correct: 0, total };
  const correct = Math.round((score / maxScore) * total);
  return { correct: Math.min(total, Math.max(0, correct)), total };
}

export function buildAttemptResult(
  attempt: AttemptForResult,
  exercise: ExerciseForResult,
  options: BuildAttemptResultOptions
): AttemptResult {
  const { reveal } = options;
  const { correct, total } = countCorrect(
    attempt.score,
    attempt.maxScore,
    exercise.answer
  );

  const result: AttemptResult = {
    attemptId: attempt.id,
    score: attempt.score === null ? null : round2(attempt.score),
    maxScore: attempt.maxScore,
    graded: (attempt.teacherScore ?? attempt.score) !== null,
    correct,
    total,
    errors: readErrors(attempt.errors, reveal),
  };

  // criteria + comment luôn hiện nếu có (4c.4 chỉ ẩn correction/explanation và đáp án).
  const feedback = readAiFeedback(attempt.aiFeedback);
  if (feedback.criteria) result.criteria = feedback.criteria;
  if (feedback.comment !== undefined) result.comment = feedback.comment;


  if (reveal) {
     if (exercise.answer !== null && exercise.answer !== undefined) {
    result.answer = exercise.answer;
  }
    result.explanation =
      toStudentView(exercise, { revealExplanation: true }).explanation ?? null;
  }

  return result;
}