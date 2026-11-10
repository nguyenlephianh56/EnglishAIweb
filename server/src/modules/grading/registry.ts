// TODO: dang ky dang bai -> ham cham
import type {
  AutoGradedType,
  GradeResult,
  Grader,
  StudentAnswerOf,
} from "./types";
import { AUTO_GRADED_TYPES } from "./types";
import type { ParseResult } from "./student-answer.schema";
import {
  parseChoiceAnswer,
  parseMatchingAnswer,
  parseTextAnswer,
} from "./student-answer.schema";
import { gradeMultipleChoice } from "./auto/multipleChoice.grader";
import { gradeFillBlank } from "./auto/fillBlank.grader";
import { gradeListeningFill } from "./auto/listeningFill.grader";
import { gradeMatching } from "./auto/matching.grader";
import { gradeErrorCorrection } from "./auto/errorCorrection.grader";

/**
 * Registry: type -> { hàm chấm, hàm kiểm hình dạng bài làm }.
 * Thêm dạng mới = viết 1 hàm chấm + 1 hàm kiểm bài làm rồi gọi registerGrader;
 * gradeExercise không cần sửa.
 */

/** Một dạng bài đã định kiểu rõ (dùng khi viết hàm chấm). */
export interface RegistryEntry<T extends AutoGradedType> {
  grade: Grader<T>;
  /** expectedLength = số phần tử của `answer` GV. */
  parseStudentAnswer: (
    studentAnswer: unknown,
    expectedLength: number
  ) => ParseResult<StudentAnswerOf<T>>;
}

/** Dạng lưu trong registry: dữ liệu vào là unknown (đọc từ DB/JSON). */
export interface AnyRegistryEntry {
  grade: (content: unknown, answer: unknown, studentAnswer: unknown) => GradeResult;
  parseStudentAnswer: (
    studentAnswer: unknown,
    expectedLength: number
  ) => ParseResult<unknown>;
}

/**
 * Ranh giới giữa kiểu chặt (từng dạng) và kiểu lỏng (registry): content/answer
 * đã được T1 (validateExercise) kiểm khi tạo bài; studentAnswer đã qua
 * parseStudentAnswer trước khi tới hàm chấm.
 */
export const defineEntry = <T extends AutoGradedType>(
  entry: RegistryEntry<T>
): AnyRegistryEntry => entry as unknown as AnyRegistryEntry;

const graderRegistry = new Map<string, AnyRegistryEntry>();

/** Đăng ký một dạng. Đăng ký trùng type -> lỗi (tránh ghi đè nhầm). */
export function registerGrader(type: string, entry: AnyRegistryEntry): void {
  if (graderRegistry.has(type)) {
    throw new Error(`Dạng bài "${type}" đã được đăng ký chấm tự động`);
  }
  graderRegistry.set(type, entry);
}

/** Gỡ đăng ký (chủ yếu để test dọn dẹp). Trả true nếu có gỡ. */
export function unregisterGrader(type: string): boolean {
  return graderRegistry.delete(type);
}

/** Trả entry của type, hoặc undefined nếu không chấm tự động (writing, speaking, lạ). */
export function getGrader(type: unknown): AnyRegistryEntry | undefined {
  return typeof type === "string" ? graderRegistry.get(type) : undefined;
}

// Record<AutoGradedType, ...> bắt buộc đủ 5 dạng: thiếu dạng nào TypeScript báo lỗi.
const builtInEntries: Record<AutoGradedType, AnyRegistryEntry> = {
  multiple_choice: defineEntry<"multiple_choice">({
    grade: gradeMultipleChoice,
    parseStudentAnswer: parseChoiceAnswer,
  }),
  fill_blank: defineEntry<"fill_blank">({
    grade: gradeFillBlank,
    parseStudentAnswer: parseTextAnswer,
  }),
  matching: defineEntry<"matching">({
    grade: gradeMatching,
    parseStudentAnswer: parseMatchingAnswer,
  }),
  error_correction: defineEntry<"error_correction">({
    grade: gradeErrorCorrection,
    parseStudentAnswer: parseTextAnswer,
  }),
  // listening_fill: cùng cách chấm với fill_blank (chung gradeBlanks), khác errors[].type
  listening_fill: defineEntry<"listening_fill">({
    grade: gradeListeningFill,
    parseStudentAnswer: parseTextAnswer,
  }),
};

for (const type of AUTO_GRADED_TYPES) {
  registerGrader(type, builtInEntries[type]);
}