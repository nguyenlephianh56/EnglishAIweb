import { z } from "zod";
import {
  exerciseSchemas,
  exerciseTypeSchema,
  countBlanks,
  TYPES_WITHOUT_ANSWER,
  type ExerciseType,
  type ContentOf,
  type AnswerOf,
} from "./exercise-content.schema";

/**
 * validateExercise(type, content, answer): kiểm tra MỘT bài tập gồm 3 lớp:
 *   1. type phải thuộc 7 dạng bài.
 *   2. content và answer đúng schema của dạng đó (kèm quy tắc có/không có answer).
 *   3. Kiểm tra chéo content <-> answer (độ dài, phạm vi chỉ số...).
 * Kết quả là một trong hai:
 *   { success: true,  data: { content, answer } }   (dữ liệu đã trim, answer = null nếu writing/speaking)
 *   { success: false, errors: [{ path, message }] }
 */

export interface ExerciseValidationError {
  /** Đường dẫn tới field sai, ví dụ "content.questions[0].options" hoặc "answer[1]". */
  path: string;
  /** Thông báo tiếng Việt. */
  message: string;
}

export type ValidateExerciseResult<T extends ExerciseType = ExerciseType> =
  | { success: true; data: { content: ContentOf<T>; answer: AnswerOf<T> } }
  | { success: false; errors: ExerciseValidationError[] };

// ---------------------------------------------------------------------------
// Việt hóa các lỗi mặc định của Zod (chỉ áp dụng khi parse bài tập,
// không đổi thông báo của auth hay module khác)
// ---------------------------------------------------------------------------
const TYPE_NAME_VI: Record<string, string> = {
  string: "chuỗi ký tự",
  number: "số",
  integer: "số nguyên",
  boolean: "true/false",
  array: "mảng",
  object: "đối tượng",
  null: "null",
  undefined: "không có giá trị",
};

const typeNameVi = (name: string) => TYPE_NAME_VI[name] ?? name;

export const viErrorMap: z.ZodErrorMap = (issue, ctx) => {
  // Nếu schema đã tự đặt thông báo riêng (khác thông báo tiếng Anh mặc định của Zod)
  // thì giữ nguyên, chỉ dịch những lỗi mà Zod tự sinh.
  const zodEnglish = z.defaultErrorMap(issue, { data: ctx.data, defaultError: "" }).message;
  if (ctx.defaultError !== zodEnglish) {
    return { message: ctx.defaultError };
  }

  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined") {
        return { message: "Thiếu dữ liệu bắt buộc" };
      }
      return {
        message: `Sai kiểu dữ liệu: cần ${typeNameVi(issue.expected)}, nhận được ${typeNameVi(issue.received)}`,
      };

    case z.ZodIssueCode.unrecognized_keys:
      return { message: `Có field không được phép: ${issue.keys.join(", ")}` };

    case z.ZodIssueCode.too_small:
      if (issue.type === "array") {
        return {
          message: issue.exact
            ? `Phải có đúng ${issue.minimum} phần tử`
            : `Cần ít nhất ${issue.minimum} phần tử`,
        };
      }
      return { message: `Giá trị quá nhỏ (tối thiểu ${issue.minimum})` };

    case z.ZodIssueCode.too_big:
      if (issue.type === "array") {
        return {
          message: issue.exact
            ? `Phải có đúng ${issue.maximum} phần tử`
            : `Không được vượt quá ${issue.maximum} phần tử`,
        };
      }
      return { message: `Giá trị quá lớn (tối đa ${issue.maximum})` };

    default:
      return { message: "Giá trị không hợp lệ" };
  }
};

// ---------------------------------------------------------------------------
// Đổi lỗi của Zod thành { path, message }
// ---------------------------------------------------------------------------

/** ["questions", 0, "options"] + "content" -> "content.questions[0].options" */
export function formatPath(root: string, path: (string | number)[]): string {
  return path.reduce<string>(
    (acc, part) => (typeof part === "number" ? `${acc}[${part}]` : `${acc}.${part}`),
    root
  );
}

function zodIssuesToErrors(root: string, error: z.ZodError): ExerciseValidationError[] {
  return error.issues.map((issue) => ({
    path: formatPath(root, issue.path),
    message: issue.message,
  }));
}

// ---------------------------------------------------------------------------
// Kiểm tra chéo content <-> answer (chỉ chạy khi cả hai đã đúng schema riêng)
// ---------------------------------------------------------------------------
function crossCheck(
  type: ExerciseType,
  content: unknown,
  answer: unknown
): ExerciseValidationError[] {
  const errors: ExerciseValidationError[] = [];
  const add = (path: string, message: string) => errors.push({ path, message });

  switch (type) {
    case "multiple_choice": {
      const c = content as ContentOf<"multiple_choice">;
      const a = answer as AnswerOf<"multiple_choice">;
      if (a.length !== c.questions.length) {
        add("answer", `Số đáp án (${a.length}) phải bằng số câu hỏi (${c.questions.length})`);
      }
      a.slice(0, c.questions.length).forEach((value, i) => {
        const max = c.questions[i].options.length - 1;
        if (value > max) {
          add(
            `answer[${i}]`,
            `Đáp án câu ${i + 1} là ${value}, phải nằm trong khoảng từ 0 đến ${max}`
          );
        }
      });
      break;
    }

    case "fill_blank": {
      const c = content as ContentOf<"fill_blank">;
      const a = answer as AnswerOf<"fill_blank">;
      const blanks = countBlanks(c.text);
      if (a.length !== blanks) {
        add("answer", `Số đáp án (${a.length}) phải bằng số chỗ trống "___" trong text (${blanks})`);
      }
      break;
    }

    case "matching": {
      const c = content as ContentOf<"matching">;
      const a = answer as AnswerOf<"matching">;
      const size = c.left.length;
      if (a.length !== size) {
        add("answer", `Số cặp nối (${a.length}) phải bằng số mục của cột trái (${size})`);
      }
      a.forEach(([leftIndex, rightIndex], i) => {
        if (leftIndex >= size) {
          add(
            `answer[${i}][0]`,
            `Chỉ số cột trái ${leftIndex} vượt phạm vi, phải từ 0 đến ${size - 1}`
          );
        }
        if (rightIndex >= c.right.length) {
          add(
            `answer[${i}][1]`,
            `Chỉ số cột phải ${rightIndex} vượt phạm vi, phải từ 0 đến ${c.right.length - 1}`
          );
        }
      });
      break;
    }

    case "error_correction": {
      const c = content as ContentOf<"error_correction">;
      const a = answer as AnswerOf<"error_correction">;
      if (a[0].toLowerCase() === c.wrong.toLowerCase()) {
        add("answer[0]", "Bản sửa không được giống phần sai (wrong)");
      }
      break;
    }

    case "listening_fill": {
      const c = content as ContentOf<"listening_fill">;
      const a = answer as AnswerOf<"listening_fill">;
      if (a.length !== c.blanks) {
        add("answer", `Số đáp án (${a.length}) phải bằng số chỗ trống blanks (${c.blanks})`);
      }
      break;
    }

    // writing, speaking: không có answer nên không có gì để kiểm tra chéo
    default:
      break;
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Hàm chính
// ---------------------------------------------------------------------------
export function validateExercise<T extends ExerciseType>(
  type: T,
  content: unknown,
  answer: unknown
): ValidateExerciseResult<T>;
export function validateExercise(
  type: unknown,
  content: unknown,
  answer: unknown
): ValidateExerciseResult;
export function validateExercise(
  type: unknown,
  content: unknown,
  answer: unknown
): ValidateExerciseResult {
  // Lớp 1: type
  const typeResult = exerciseTypeSchema.safeParse(type, { errorMap: viErrorMap });
  if (!typeResult.success) {
    return { success: false, errors: zodIssuesToErrors("type", typeResult.error) };
  }
  const exerciseType = typeResult.data;
  const { contentSchema, answerSchema } = exerciseSchemas[exerciseType] as {
    contentSchema: z.ZodTypeAny;
    answerSchema: z.ZodTypeAny;
  };

  const errors: ExerciseValidationError[] = [];

  // Lớp 2: content và answer theo schema của từng dạng
  const contentResult = contentSchema.safeParse(content, { errorMap: viErrorMap });
  if (!contentResult.success) {
    errors.push(...zodIssuesToErrors("content", contentResult.error));
  }

  const mustHaveAnswer = !TYPES_WITHOUT_ANSWER.includes(exerciseType);
  let answerResult: z.SafeParseReturnType<unknown, unknown> | undefined;
  if (mustHaveAnswer && (answer === null || answer === undefined)) {
    errors.push({
      path: "answer",
      message: `Dạng bài "${exerciseType}" bắt buộc phải có đáp án (answer)`,
    });
  } else {
    answerResult = answerSchema.safeParse(answer, { errorMap: viErrorMap });
    if (!answerResult.success) {
      errors.push(...zodIssuesToErrors("answer", answerResult.error));
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Lớp 3: kiểm tra chéo (cả hai đã đúng schema riêng)
  const parsedContent = (contentResult as z.SafeParseSuccess<unknown>).data;
  const parsedAnswer = (answerResult as z.SafeParseSuccess<unknown>).data;
  const crossErrors = crossCheck(exerciseType, parsedContent, parsedAnswer);
  if (crossErrors.length > 0) {
    return { success: false, errors: crossErrors };
  }

  return {
    success: true,
    data: { content: parsedContent, answer: parsedAnswer },
  } as ValidateExerciseResult;
}