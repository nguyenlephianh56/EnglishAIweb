// =====================================================================
// grading/writingLength.ts — Kiểm tra độ dài bài Viết TRƯỚC khi lưu/gọi AI (T13).
//
// Hàm THUẦN: không DB, không AI, không đọc env (giới hạn nền truyền vào từ ngoài).
// Mục đích: bài quá ngắn/quá dài bị chặn sớm để không tốn lượt AI.
// Kết quả KHÔNG chứa nội dung bài viết (chỉ số liệu), an toàn để đưa vào lỗi 400.
// =====================================================================

/**
 * Một "từ" = cụm chữ/số Unicode; dấu ' ’ - nằm GIỮA chữ/số vẫn là 1 từ
 * (don't, it’s, well-known). Dấu câu, ký hiệu, khoảng trắng liên tiếp bị bỏ qua.
 */
const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

/**
 * Đếm số từ. Chuẩn hóa NFC trước để tiếng Việt gõ kiểu tổ hợp (e + dấu rời)
 * không bị tách thành nhiều từ.
 */
export const countWords = (text: string): number =>
  (text.normalize("NFC").match(WORD_PATTERN) ?? []).length;

/** Giới hạn nền (lấy từ .env ở bước sau): số từ và số ký tự tối đa. */
export interface WritingBaseLimits {
  maxWords: number;
  maxChars: number;
}

/** Hệ số nới trần theo minWords, và số ký tự ước tính cho 1 từ (kể cả khoảng trắng). */
const MAX_WORDS_PER_MIN_WORDS = 3;
const CHARS_PER_WORD = 7;

/**
 * Trần thực tế của MỘT bài, nới theo minWords của đề:
 *   maxWords = max(base.maxWords, minWords × 3)
 *   maxChars = max(base.maxChars, minWords × 3 × 7)
 * Chỉ nới theo minWords (không nhân trần nền), nên bài minWords nhỏ giữ đúng trần .env.
 * Đề yêu cầu nhiều từ thì không bị trần cố định chặn nhầm.
 */
export const resolveWritingLimits = (
  minWords: number,
  base: WritingBaseLimits
): WritingBaseLimits => {
  const scaledWords = minWords * MAX_WORDS_PER_MIN_WORDS;
  const maxWords = Math.max(base.maxWords, scaledWords);
  const maxChars = Math.max(base.maxChars, scaledWords * CHARS_PER_WORD);
  return { maxWords, maxChars };
};

export type WritingLengthResult =
  | { ok: true; wordCount: number; charCount: number }
  | {
      ok: false;
      code: "WRITING_TOO_SHORT";
      message: string;
      wordCount: number;
      minWords: number;
    }
  | {
      ok: false;
      code: "WRITING_TOO_LONG";
      message: string;
      wordCount: number;
      charCount: number;
      maxWords: number;
      maxChars: number;
    };

/**
 * Kiểm tra bài viết (đã trim) theo minWords của đề và giới hạn nền.
 * - Số từ < minWords -> WRITING_TOO_SHORT (không dung sai: thiếu 1 từ cũng từ chối).
 * - Số từ > maxWords hoặc số ký tự > maxChars -> WRITING_TOO_LONG.
 * Nếu cùng lúc vi phạm cả hai (vd 1 "từ" dài 5000 ký tự), ưu tiên báo TOO_SHORT.
 * Đúng bằng minWords/maxWords/maxChars thì qua.
 * minWords không hợp lệ (âm, thập phân, NaN) coi như 0.
 */
export const validateWritingLength = (
  text: string,
  minWords: number,
  base: WritingBaseLimits
): WritingLengthResult => {
  const min = Number.isInteger(minWords) && minWords > 0 ? minWords : 0;
  const { maxWords, maxChars } = resolveWritingLimits(min, base);
  const wordCount = countWords(text);
  const charCount = text.length;

  if (wordCount < min) {
    return {
      ok: false,
      code: "WRITING_TOO_SHORT",
      message: `Bài viết quá ngắn: cần ít nhất ${min} từ, bài của bạn có ${wordCount} từ`,
      wordCount,
      minWords: min,
    };
  }

  if (wordCount > maxWords || charCount > maxChars) {
    return {
      ok: false,
      code: "WRITING_TOO_LONG",
      message: `Bài viết quá dài: tối đa ${maxWords} từ và ${maxChars} ký tự`,
      wordCount,
      charCount,
      maxWords,
      maxChars,
    };
  }

  return { ok: true, wordCount, charCount };
};