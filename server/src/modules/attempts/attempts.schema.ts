import { z } from "zod";

// Số nguyên lớn nhất của cột INT trong PostgreSQL; vượt quá thì Prisma sẽ báo lỗi 500.
const MAX_EXERCISE_ID = 2147483647;

/** Chế độ nộp được nhận. "exam" (thi thử) là P1 nên chưa mở. */
export const ATTEMPT_MODES = ["practice"] as const;
export type AttemptMode = (typeof ATTEMPT_MODES)[number];

const positiveIdField = (name: string, label: string) =>
  z
    .number({
      invalid_type_error: `${name}: ${label} phải là số nguyên dương`,
    })
    .int(`${name}: ${label} phải là số nguyên dương`)
    .min(1, `${name}: ${label} phải là số nguyên dương`)
    .max(MAX_EXERCISE_ID, `${name}: ${label} không hợp lệ`);

export const createAttemptSchema = z
  .object(
    {
      // Tự luyện: bắt buộc. Bài giao: tùy chọn, nếu có phải khớp assignment.exercise_id
      // (việc so khớp làm ở service vì cần đọc DB).
      exerciseId: positiveIdField("exerciseId", "Mã bài tập").optional(),

      // Không gửi = tự luyện (assignment_id NULL). Có gửi = nộp bài giao.
      // null, chuỗi, số âm/số thập phân... đều bị từ chối (400).
      assignmentId: positiveIdField("assignmentId", "Mã bài giao").optional(),

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
    },
    {
      required_error: "Body là bắt buộc",
      invalid_type_error: "Body phải là một object JSON",
    }
  )
  // Field thừa (studentId, is_late, submitted_at, score...) bị zod bỏ khi parse.
  .superRefine((data, ctx) => {
    if (data.assignmentId === undefined && data.exerciseId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exerciseId"],
        message: "exerciseId: Mã bài tập là bắt buộc",
      });
    }
  });

export type CreateAttemptInput = z.infer<typeof createAttemptSchema>;