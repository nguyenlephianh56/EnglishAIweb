import type {
  AnswerOf,
  ContentOf,
} from "../exercises/exercise-content.schema";

/**
 * Kiểu dùng chung cho phần chấm tự động (T3).
 * Chỉ `import type` từ module exercises: không phụ thuộc lúc chạy.
 */

/** Điểm tối đa (thang 10, xem Project.md mục 4b). */
export const MAX_SCORE = 10 as const;

/** Các dạng bài chấm tự động (bảng 4b: 4 dạng + listening_fill). */
export const AUTO_GRADED_TYPES = [
  "multiple_choice",
  "fill_blank",
  "matching",
  "error_correction",
  "listening_fill",
] as const;

export type AutoGradedType = (typeof AUTO_GRADED_TYPES)[number];

/**
 * Một lỗi của học sinh. `type` theo quy ước `nhóm:chi_tiết`
 * (vd "grammar:tense", "vocab"); thống kê lớp gom theo đúng chuỗi này.
 */
export interface GradeError {
  type: string;
  text: string;
  correction: string;
  explanation?: string;
}

/** Kết quả chấm của một lần nộp. */
export interface GradeResult {
  /** 0..10, làm tròn 2 chữ số thập phân. */
  score: number;
  maxScore: typeof MAX_SCORE;
  /** Số câu/cặp đúng (để FE hiện "đúng x/y"). */
  correct: number;
  /** Tổng số câu/cặp. */
  total: number;
  errors: GradeError[];
}

/**
 * Bài làm của học sinh (`attempts.answer`) theo từng dạng.
 * Khác `answer` của GV: được phép bỏ trống (null hoặc chuỗi rỗng = chưa làm,
 * tính là sai). Riêng matching: chỉ gồm các cặp đã nối (0..n cặp).
 */
export interface StudentAnswerMap {
  multiple_choice: (number | null)[];
  fill_blank: (string | null)[];
  matching: [number, number][];
  error_correction: (string | null)[];
  listening_fill: (string | null)[];
}

export type StudentAnswerOf<T extends AutoGradedType> = StudentAnswerMap[T];

/** Hàm chấm của một dạng: hàm thuần, không async, không DB. */
export type Grader<T extends AutoGradedType> = (
  content: ContentOf<T>,
  answer: AnswerOf<T>,
  studentAnswer: StudentAnswerOf<T>
) => GradeResult;