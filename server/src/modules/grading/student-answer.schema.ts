import { z } from "zod";
import type { StudentAnswerOf } from "./types";

/**
 * Kiểm tra HÌNH DẠNG bài làm của học sinh (`attempts.answer`) trước khi chấm.
 * Khác `answer` của GV: được bỏ trống (null hoặc "" = chưa làm, tính sai),
 * chỉ cần đúng kiểu và đúng độ dài. Độ dài mong đợi = số phần tử của `answer` GV
 * (T1 đã đảm bảo nó khớp với content).
 */

/** Độ dài tối đa một câu trả lời dạng chữ (khớp giới hạn đáp án của T1). */
export const STUDENT_TEXT_MAX = 500;

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; message: string };

const MAX_ISSUES_IN_MESSAGE = 5;

const formatPath = (path: (string | number)[]): string =>
  path.reduce<string>(
    (acc, part) => (typeof part === "number" ? `${acc}[${part}]` : `${acc}.${part}`),
    "bài làm"
  );

function parseWith<T>(schema: z.ZodTypeAny, value: unknown): ParseResult<T> {
  const result = schema.safeParse(value);
  if (result.success) return { success: true, data: result.data as T };

  const parts = result.error.issues
    .slice(0, MAX_ISSUES_IN_MESSAGE)
    .map((issue) => `${formatPath(issue.path)}: ${issue.message}`);
  const hidden = result.error.issues.length - parts.length;
  if (hidden > 0) parts.push(`(và ${hidden} lỗi khác)`);
  return { success: false, message: parts.join("; ") };
}

// Mảng bài làm; `exact` = true: đúng n phần tử, false: tối đa n phần tử.
const listOf = (item: z.ZodTypeAny, n: number, exact: boolean) => {
  const base = z.array(item, {
    required_error: "Bài làm là bắt buộc",
    invalid_type_error: "Bài làm phải là một mảng",
  });
  return exact
    ? base.length(n, `Bài làm phải có đúng ${n} phần tử, khớp số câu của bài`)
    : base.max(n, `Bài làm không được vượt quá ${n} phần tử`);
};

// Lựa chọn trắc nghiệm: vị trí (số nguyên >= 0) hoặc null nếu bỏ trống
const choiceItem = z
  .number({
    required_error: "Thiếu lựa chọn (dùng null nếu bỏ trống)",
    invalid_type_error: "Lựa chọn phải là số (vị trí bắt đầu từ 0) hoặc null nếu bỏ trống",
  })
  .int("Lựa chọn phải là số nguyên")
  .min(0, "Lựa chọn không được là số âm")
  .nullable();

// Câu trả lời dạng chữ: chuỗi (có thể rỗng) hoặc null nếu bỏ trống
const textItem = z
  .string({
    required_error: "Thiếu câu trả lời (dùng null hoặc \"\" nếu bỏ trống)",
    invalid_type_error: "Câu trả lời phải là chuỗi ký tự hoặc null nếu bỏ trống",
  })
  .max(STUDENT_TEXT_MAX, `Câu trả lời không được vượt quá ${STUDENT_TEXT_MAX} ký tự`)
  .nullable();

// Một cặp nối: [chỉ số trái, chỉ số phải]
const pairItem = z
  .array(
    z
      .number({
        required_error: "Thiếu chỉ số trong cặp nối",
        invalid_type_error: "Chỉ số trong cặp nối phải là số",
      })
      .int("Chỉ số trong cặp nối phải là số nguyên")
      .min(0, "Chỉ số trong cặp nối không được là số âm"),
    { invalid_type_error: "Mỗi cặp nối phải là mảng [chỉ số trái, chỉ số phải]" }
  )
  .length(2, "Mỗi cặp nối phải có đúng 2 số: [chỉ số trái, chỉ số phải]");

export const parseChoiceAnswer = (
  value: unknown,
  expectedLength: number
): ParseResult<StudentAnswerOf<"multiple_choice">> =>
  parseWith(listOf(choiceItem, expectedLength, true), value);

/** Dùng chung cho fill_blank, listening_fill và error_correction (mảng chuỗi). */
export const parseTextAnswer = (
  value: unknown,
  expectedLength: number
): ParseResult<StudentAnswerOf<"fill_blank">> =>
  parseWith(listOf(textItem, expectedLength, true), value);

/** Nối cặp: 0..n cặp đã nối (chưa nối = bỏ trống), không trùng chỉ số, trong phạm vi. */
export const parseMatchingAnswer = (
  value: unknown,
  expectedLength: number
): ParseResult<StudentAnswerOf<"matching">> => {
  const schema = listOf(pairItem, expectedLength, false).superRefine((pairs, ctx) => {
    const usedLeft = new Set<number>();
    const usedRight = new Set<number>();
    (pairs as number[][]).forEach(([left, right], index) => {
      if (left >= expectedLength) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 0],
          message: `Chỉ số cột trái ${left} vượt phạm vi, phải từ 0 đến ${expectedLength - 1}`,
        });
      } else if (usedLeft.has(left)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 0],
          message: `Chỉ số cột trái ${left} bị dùng nhiều lần`,
        });
      }
      if (right >= expectedLength) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 1],
          message: `Chỉ số cột phải ${right} vượt phạm vi, phải từ 0 đến ${expectedLength - 1}`,
        });
      } else if (usedRight.has(right)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 1],
          message: `Chỉ số cột phải ${right} bị dùng nhiều lần`,
        });
      }
      usedLeft.add(left);
      usedRight.add(right);
    });
  });
  return parseWith(schema, value);
};