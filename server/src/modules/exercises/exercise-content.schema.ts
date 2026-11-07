import { z } from "zod";

/**
 * Schema cho phần `content` và `answer` của bài tập (bảng 4b trong Project.md).
 * 7 dạng: multiple_choice | fill_blank | matching | error_correction |
 *         listening_fill | writing | speaking
 *
 * Lưu ý: ở đây chỉ kiểm từng schema RIÊNG LẺ. Kiểm tra chéo giữa content và
 * answer (độ dài, phạm vi chỉ số) nằm ở validateExercise (bước 3).
 */

// ---------------------------------------------------------------------------
// Giới hạn kích thước (tránh dữ liệu quá lớn)
// ---------------------------------------------------------------------------
export const LIMITS = {
  longText: 5000, // passage, text, script
  prompt: 2000, // prompt, hint, sample
  sentence: 1000, // sentence của error_correction
  shortText: 500, // câu hỏi, lựa chọn, đáp án
  matchingItem: 200, // mỗi mục của left/right
  maxQuestions: 20,
  minOptions: 2,
  maxOptions: 6,
  maxBlanks: 20,
  maxMinWords: 1000,
  minPairs: 2,
  maxPairs: 15,
} as const;

// ---------------------------------------------------------------------------
// Hàm dựng schema dùng chung (để thông báo lỗi tiếng Việt thống nhất)
// ---------------------------------------------------------------------------

/** Chuỗi bắt buộc: tự trim, không được rỗng/chỉ toàn khoảng trắng, có giới hạn dài. */
export const requiredText = (label: string, max: number) =>
  z
    .string({
      required_error: `${label} là bắt buộc`,
      invalid_type_error: `${label} phải là chuỗi ký tự`,
    })
    .trim()
    .min(1, `${label} không được để trống`)
    .max(max, `${label} không được vượt quá ${max} ký tự`);

/** Mảng có số phần tử trong [min, max]. */
export const sizedArray = <T extends z.ZodTypeAny>(
  label: string,
  item: T,
  min: number,
  max: number
) =>
  z
    .array(item, {
      required_error: `${label} là bắt buộc`,
      invalid_type_error: `${label} phải là một mảng`,
    })
    .min(min, `${label} cần ít nhất ${min} phần tử`)
    .max(max, `${label} không được vượt quá ${max} phần tử`);

/** Số nguyên >= 0 (dùng cho chỉ số vị trí). */
const indexNumber = (label: string) =>
  z
    .number({
      required_error: `${label} là bắt buộc`,
      invalid_type_error: `${label} phải là số`,
    })
    .int(`${label} phải là số nguyên`)
    .min(0, `${label} không được là số âm`);

/**
 * Đếm số chỗ trống trong chuỗi. Một chỗ trống = một cụm gạch dưới liên tiếp
 * từ 3 ký tự trở lên ("___" hoặc "_____" đều tính là 1 chỗ).
 */
export const BLANK_PATTERN = /_{3,}/g;
export const countBlanks = (text: string): number =>
  (text.match(BLANK_PATTERN) ?? []).length;

// ---------------------------------------------------------------------------
// 1) multiple_choice
// ---------------------------------------------------------------------------
const multipleChoiceQuestionSchema = z
  .object({
    q: requiredText("Câu hỏi", LIMITS.shortText),
    options: sizedArray(
      "Danh sách lựa chọn",
      requiredText("Lựa chọn", LIMITS.shortText),
      LIMITS.minOptions,
      LIMITS.maxOptions
    ),
  })
  .strict()
  .superRefine((question, ctx) => {
    // Không cho 2 lựa chọn trùng nhau (so không phân biệt hoa/thường)
    const seen = new Set<string>();
    question.options.forEach((option, index) => {
      if (option.length === 0) return; // lựa chọn rỗng đã có lỗi riêng
      const key = option.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options", index],
          message: `Lựa chọn "${option}" bị trùng với lựa chọn trước đó`,
        });
      }
      seen.add(key);
    });
  });

export const multipleChoiceContentSchema = z
  .object({
    passage: requiredText("Đoạn văn", LIMITS.longText).optional(),
    questions: sizedArray(
      "Danh sách câu hỏi",
      multipleChoiceQuestionSchema,
      1,
      LIMITS.maxQuestions
    ),
  })
  .strict();

/** Mỗi phần tử = vị trí (bắt đầu từ 0) của lựa chọn đúng ở câu tương ứng. */
export const multipleChoiceAnswerSchema = sizedArray(
  "Đáp án",
  indexNumber("Vị trí đáp án"),
  1,
  LIMITS.maxQuestions
);

// ---------------------------------------------------------------------------
// 2) fill_blank
// ---------------------------------------------------------------------------
export const fillBlankContentSchema = z
  .object({
    text: requiredText("Đoạn văn cần điền", LIMITS.longText).refine(
      // text rỗng đã bị báo lỗi "không được để trống" ở trên, không báo thêm lỗi chỗ trống
      (value) => value.length === 0 || countBlanks(value) >= 1,
      'Đoạn văn phải chứa ít nhất một chỗ trống "___"'
    ),
    hint: requiredText("Gợi ý", LIMITS.prompt).optional(),
  })
  .strict();

/** Mỗi phần tử = từ cần điền vào một chỗ trống, theo thứ tự xuất hiện. */
export const fillBlankAnswerSchema = sizedArray(
  "Đáp án",
  requiredText("Đáp án chỗ trống", LIMITS.shortText),
  1,
  LIMITS.maxBlanks
);

// ---------------------------------------------------------------------------
// 3) matching
// ---------------------------------------------------------------------------
const matchingItems = (label: string) =>
  sizedArray(
    label,
    requiredText(`Mục của ${label}`, LIMITS.matchingItem),
    LIMITS.minPairs,
    LIMITS.maxPairs
  );

export const matchingContentSchema = z
  .object({
    left: matchingItems("Cột trái (left)"),
    right: matchingItems("Cột phải (right)"),
  })
  .strict()
  .superRefine((content, ctx) => {
    if (content.left.length !== content.right.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["right"],
        message: `Cột trái và cột phải phải cùng độ dài (hiện là ${content.left.length} và ${content.right.length})`,
      });
    }
  });

/** Mỗi phần tử = một cặp [chỉ số cột trái, chỉ số cột phải]. */
export const matchingAnswerSchema = sizedArray(
  "Đáp án",
  z.tuple(
    [indexNumber("Chỉ số cột trái"), indexNumber("Chỉ số cột phải")],
    {
      required_error: "Mỗi cặp nối là bắt buộc",
      invalid_type_error: "Mỗi cặp nối phải là mảng [chỉ số trái, chỉ số phải]",
    }
  ),
  LIMITS.minPairs,
  LIMITS.maxPairs
).superRefine((pairs, ctx) => {
  // Không trùng chỉ số trái, không trùng chỉ số phải
  const usedLeft = new Set<number>();
  const usedRight = new Set<number>();
  pairs.forEach(([left, right], index) => {
    if (usedLeft.has(left)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 0],
        message: `Chỉ số cột trái ${left} bị dùng nhiều lần`,
      });
    }
    if (usedRight.has(right)) {
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

// ---------------------------------------------------------------------------
// 4) error_correction
// ---------------------------------------------------------------------------
export const errorCorrectionContentSchema = z
  .object({
    sentence: requiredText("Câu gốc (sentence)", LIMITS.sentence),
    wrong: requiredText("Phần sai (wrong)", LIMITS.shortText),
  })
  .strict()
  .superRefine((content, ctx) => {
    // Phân biệt hoa/thường: "wrong" phải là chuỗi con nguyên văn của "sentence"
    if (!content.sentence.includes(content.wrong)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["wrong"],
        message: "Phần sai (wrong) phải xuất hiện nguyên văn trong câu gốc (sentence)",
      });
    }
  });

/** Đúng 1 phần tử: bản sửa cho phần `wrong`. */
export const errorCorrectionAnswerSchema = z
  .array(requiredText("Bản sửa", LIMITS.shortText), {
    required_error: "Đáp án là bắt buộc",
    invalid_type_error: "Đáp án phải là một mảng",
  })
  .length(1, "Đáp án sửa lỗi phải có đúng 1 phần tử (bản sửa cho phần sai)");

// ---------------------------------------------------------------------------
// 5) listening_fill (FE đọc `script` bằng speechSynthesis, HS điền các chỗ trống)
// ---------------------------------------------------------------------------
export const listeningFillContentSchema = z
  .object({
    script: requiredText("Kịch bản nghe (script)", LIMITS.longText),
    blanks: z
      .number({
        required_error: "Số chỗ trống (blanks) là bắt buộc",
        invalid_type_error: "Số chỗ trống (blanks) phải là số",
      })
      .int("Số chỗ trống (blanks) phải là số nguyên")
      .min(1, "Số chỗ trống (blanks) phải từ 1 trở lên")
      .max(
        LIMITS.maxBlanks,
        `Số chỗ trống (blanks) không được vượt quá ${LIMITS.maxBlanks}`
      ),
  })
  .strict();

/** Mỗi phần tử = từ cần điền vào một chỗ trống, theo thứ tự. */
export const listeningFillAnswerSchema = sizedArray(
  "Đáp án",
  requiredText("Đáp án chỗ trống", LIMITS.shortText),
  1,
  LIMITS.maxBlanks
);

// ---------------------------------------------------------------------------
// 6) writing (chấm bằng AI, không có đáp án)
// ---------------------------------------------------------------------------
export const writingContentSchema = z
  .object({
    prompt: requiredText("Đề bài (prompt)", LIMITS.prompt),
    minWords: z
      .number({
        required_error: "Số từ tối thiểu (minWords) là bắt buộc",
        invalid_type_error: "Số từ tối thiểu (minWords) phải là số",
      })
      .int("Số từ tối thiểu (minWords) phải là số nguyên")
      .min(1, "Số từ tối thiểu (minWords) phải lớn hơn 0")
      .max(
        LIMITS.maxMinWords,
        `Số từ tối thiểu (minWords) không được vượt quá ${LIMITS.maxMinWords}`
      ),
  })
  .strict();

/**
 * Dạng không có đáp án (writing, speaking): answer chỉ được là null hoặc
 * không có (undefined). Mọi giá trị khác (kể cả "", 0, [], {}) đều bị từ chối.
 * Kết quả parse luôn là null (khớp với cột `answer` NULL trong DB).
 */
export const noAnswerSchema = z
  .any()
  .superRefine((value, ctx) => {
    if (value !== null && value !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Dạng bài này không có đáp án, answer phải là null hoặc bỏ trống",
      });
    }
  })
  .transform((): null => null);

export const writingAnswerSchema = noAnswerSchema;

// ---------------------------------------------------------------------------
// 7) speaking (chấm bằng AI, không có đáp án)
// ---------------------------------------------------------------------------
export const speakingContentSchema = z
  .object({
    prompt: requiredText("Đề bài (prompt)", LIMITS.prompt),
    sample: requiredText("Câu mẫu (sample)", LIMITS.prompt).optional(),
  })
  .strict();

export const speakingAnswerSchema = noAnswerSchema;

// ---------------------------------------------------------------------------
// Danh sách dạng bài + map type -> schema (registry phía schema)
// ---------------------------------------------------------------------------
export const EXERCISE_TYPES = [
  "multiple_choice",
  "fill_blank",
  "matching",
  "error_correction",
  "listening_fill",
  "writing",
  "speaking",
] as const;

export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const exerciseTypeSchema = z.enum(EXERCISE_TYPES, {
  errorMap: () => ({
    message: `Dạng bài không hợp lệ. Chỉ chấp nhận: ${EXERCISE_TYPES.join(", ")}`,
  }),
});

/** Dạng bài bắt buộc phải có answer (khớp CHECK exercises_answer_required_chk). */
export const TYPES_WITHOUT_ANSWER: readonly ExerciseType[] = ["writing", "speaking"];

export const exerciseSchemas = {
  multiple_choice: {
    contentSchema: multipleChoiceContentSchema,
    answerSchema: multipleChoiceAnswerSchema,
  },
  fill_blank: {
    contentSchema: fillBlankContentSchema,
    answerSchema: fillBlankAnswerSchema,
  },
  matching: {
    contentSchema: matchingContentSchema,
    answerSchema: matchingAnswerSchema,
  },
  error_correction: {
    contentSchema: errorCorrectionContentSchema,
    answerSchema: errorCorrectionAnswerSchema,
  },
  listening_fill: {
    contentSchema: listeningFillContentSchema,
    answerSchema: listeningFillAnswerSchema,
  },
  writing: {
    contentSchema: writingContentSchema,
    answerSchema: writingAnswerSchema,
  },
  speaking: {
    contentSchema: speakingContentSchema,
    answerSchema: speakingAnswerSchema,
  },
} as const;

// ---------------------------------------------------------------------------
// Kiểu TypeScript suy ra từ schema (T3 và Người 2 dùng)
// ---------------------------------------------------------------------------
export type MultipleChoiceContent = z.infer<typeof multipleChoiceContentSchema>;
export type MultipleChoiceAnswer = z.infer<typeof multipleChoiceAnswerSchema>;
export type FillBlankContent = z.infer<typeof fillBlankContentSchema>;
export type FillBlankAnswer = z.infer<typeof fillBlankAnswerSchema>;
export type MatchingContent = z.infer<typeof matchingContentSchema>;
export type MatchingAnswer = z.infer<typeof matchingAnswerSchema>;
export type ErrorCorrectionContent = z.infer<typeof errorCorrectionContentSchema>;
export type ErrorCorrectionAnswer = z.infer<typeof errorCorrectionAnswerSchema>;
export type ListeningFillContent = z.infer<typeof listeningFillContentSchema>;
export type ListeningFillAnswer = z.infer<typeof listeningFillAnswerSchema>;
export type WritingContent = z.infer<typeof writingContentSchema>;
export type WritingAnswer = z.infer<typeof writingAnswerSchema>; // null
export type SpeakingContent = z.infer<typeof speakingContentSchema>;
export type SpeakingAnswer = z.infer<typeof speakingAnswerSchema>; // null

/** Tra kiểu content/answer theo type, ví dụ ContentOf<"matching">. */
export type ContentOf<T extends ExerciseType> = z.infer<
  (typeof exerciseSchemas)[T]["contentSchema"]
>;
export type AnswerOf<T extends ExerciseType> = z.infer<
  (typeof exerciseSchemas)[T]["answerSchema"]
>;