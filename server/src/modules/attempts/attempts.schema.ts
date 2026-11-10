import { z } from "zod";

// Số nguyên lớn nhất của cột INT trong PostgreSQL; vượt quá thì Prisma sẽ báo lỗi 500.
const MAX_EXERCISE_ID = 2147483647;

/** Chế độ nộp được nhận. "exam" (thi thử) là P1 nên chưa mở. */
export const ATTEMPT_MODES = ["practice"] as const;
export type AttemptMode = (typeof ATTEMPT_MODES)[number];

export const createAttemptSchema = z.object(
  {
    exerciseId: z
      .number({
        required_error: "exerciseId: Mã bài tập là bắt buộc",
        invalid_type_error: "exerciseId: Mã bài tập phải là số nguyên dương",
      })
      .int("exerciseId: Mã bài tập phải là số nguyên dương")
      .min(1, "exerciseId: Mã bài tập phải là số nguyên dương")
      .max(MAX_EXERCISE_ID, "exerciseId: Mã bài tập không hợp lệ"),

    // Hình dạng/độ dài do registry chấm kiểm; ở đây chỉ bắt buộc phải có gửi.
    answer: z
      .unknown()
      .refine((value) => value !== undefined, "answer: Bài làm là bắt buộc"),

    // Không gửi = "practice". Giá trị khác (kể cả "exam") -> 400.
    mode: z
      .enum(ATTEMPT_MODES, {
        errorMap: () => ({
          message: `mode: Chế độ không hợp lệ. Chỉ chấp nhận: ${ATTEMPT_MODES.join(", ")}`,
        }),
      })

      .default("practice"),

    // Chưa hỗ trợ nộp bài giao. Bất kỳ giá trị nào, kể cả null, đều bị từ chối.
    assignmentId: z.undefined({
      invalid_type_error: "assignmentId: Chưa hỗ trợ nộp bài giao",
    }),
  },
  {
    required_error: "Body là bắt buộc",
    invalid_type_error: "Body phải là một object JSON",
  }
);

export type CreateAttemptInput = z.infer<typeof createAttemptSchema>;