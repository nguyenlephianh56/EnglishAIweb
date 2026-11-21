import type { AnswerableExerciseType, ExerciseValueMap } from "../../types/exercise";

/** Bỏ khoảng trắng thừa (đầu, cuối, giữa), về chữ thường: "  Went  " -> "went" */
export const normalizeText = (s: string | undefined | null) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Các chỗ trống trong văn bản: 3 dấu gạch dưới trở lên */
export const BLANK_PATTERN = /_{3,}/g;

/** Số chỗ trống "___" của một đoạn văn */
export const countBlanks = (text: string) => (text.match(BLANK_PATTERN) ?? []).length;

/** Đếm từ ĐÚNG như backend: chữ/số, cho phép ' ’ - nối giữa từ ("don't", "well-known" là 1 từ) */
export const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
export const countWords = (text: string) => text.normalize("NFC").match(WORD_PATTERN)?.length ?? 0;

type Comparer<T extends AnswerableExerciseType> = (value: ExerciseValueMap[T], correct: ExerciseValueMap[T]) => boolean[];

const compareStrings = (value: string[], correct: string[]) => correct.map((c, i) => normalizeText(value[i]) === normalizeText(c));

const COMPARERS: { [T in AnswerableExerciseType]: Comparer<T> } = {
  // Theo từng câu
  multiple_choice: (value, correct) => correct.map((c, i) => value[i] === c),
  // Theo từng ô
  fill_blank: compareStrings,
  listening_fill: compareStrings,
  // Theo từng cặp của đáp án đúng: cặp đó có được học sinh nối đúng không
  matching: (value, correct) => correct.map(([l, r]) => value.some(([vl, vr]) => vl === l && vr === r)),
  // 1 phần tử
  error_correction: (value, correct) => [normalizeText(value[0]) === normalizeText(correct[0])],
  // Bài viết do AI chấm, không có đáp án để so
  writing: () => [],
  // Bài Nói do AI chấm, không có đáp án để so
  speaking: () => [],
};

/**
 * So bài làm với đáp án đúng, trả mảng đúng/sai từng ý:
 * trắc nghiệm theo câu; điền từ và nghe điền từ theo ô; nối cặp theo cặp của đáp án; sửa lỗi 1 phần tử.
 * Chuỗi so sánh không phân biệt hoa thường và bỏ khoảng trắng thừa. Bài viết trả mảng rỗng (AI chấm).
 */
export function compareAnswer<T extends AnswerableExerciseType>(type: T, value: ExerciseValueMap[T], correctAnswer: ExerciseValueMap[T]): boolean[] {
  return (COMPARERS[type] as Comparer<T>)(value, correctAnswer);
}
