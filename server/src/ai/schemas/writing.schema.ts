// =====================================================================
// ai/schemas/writing.schema.ts — Khuôn Zod cho JSON AI trả về khi chấm bài Viết (T13).
//
// Khuôn (Project.md mục 4b):
//   { criteria:{content,coherence,vocabulary,grammar}, comment, errors:[{type,text,correction,explanation}] }
//
// File này CHỈ có schema + kiểu, không có logic nghiệp vụ, không import prisma/env.
// Không có điểm tổng ở đây: điểm tổng do dòng sau của T13 tính.
// `comment` / `explanation` phải là tiếng Việt: dặn ở mẫu prompt, KHÔNG kiểm bằng code.
// `errors[].text` có nằm trong bài viết hay không: KHÔNG kiểm bằng code (tránh tốn retry).
// =====================================================================
import { z } from "zod";

/** Giới hạn (một chỗ duy nhất để chỉnh). */
export const WRITING_SCORE_MIN = 0;
export const WRITING_SCORE_MAX = 10;
export const WRITING_COMMENT_MAX = 1000;
export const WRITING_ERRORS_MAX = 20;
export const WRITING_ERROR_FIELD_MAX = 300;
export const WRITING_ERROR_TYPE_MAX = 60;

/** Một tiêu chí: số (thập phân được) từ 0 đến 10. Chuỗi "7" bị từ chối (không ép kiểu). */
const criterionScoreSchema = z
  .number()
  .finite()
  .min(WRITING_SCORE_MIN)
  .max(WRITING_SCORE_MAX);

/** Chuỗi đã cắt khoảng trắng đầu/cuối, không rỗng, có giới hạn độ dài. */
const boundedText = z.string().trim().min(1).max(WRITING_ERROR_FIELD_MAX);

/**
 * `type`: chữ thường/số/gạch dưới; một dấu ":" tùy chọn.
 * Hợp lệ: `vocab`, `grammar:tense`, `grammar:word_order`.
 * Sai: `Grammar:Tense`, `a:b:c`, `grammar:`, `:tense`, chuỗi rỗng.
 */
export const writingErrorTypeSchema = z
  .string()
  .max(WRITING_ERROR_TYPE_MAX)
  .regex(/^[a-z0-9_]+(?::[a-z0-9_]+)?$/);

export const writingErrorSchema = z
  .object({
    type: writingErrorTypeSchema,
    text: boundedText,
    correction: boundedText,
    explanation: boundedText,
  })
  .strict();

export const writingCriteriaSchema = z
  .object({
    content: criterionScoreSchema,
    coherence: criterionScoreSchema,
    vocabulary: criterionScoreSchema,
    grammar: criterionScoreSchema,
  })
  .strict();

export const writingGradeResultSchema = z
  .object({
    criteria: writingCriteriaSchema,
    comment: z.string().trim().min(1).max(WRITING_COMMENT_MAX),
    // Mảng rỗng hợp lệ (bài tốt, không lỗi).
    errors: z.array(writingErrorSchema).max(WRITING_ERRORS_MAX),
  })
  .strict();

export type WritingGradeResult = z.infer<typeof writingGradeResultSchema>;
export type WritingError = z.infer<typeof writingErrorSchema>;