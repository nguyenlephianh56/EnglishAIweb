import { z } from "zod";
import {
  ATTEMPT_LIST_DEFAULT_LIMIT,
  ATTEMPT_LIST_MAX_LIMIT,
} from "./attempts.constants";

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


// ---------------------------------------------------------------------------
// GET /attempts và GET /attempts/:id
// Query string và path param luôn là CHUỖI, nên đọc bằng regex số nguyên không dấu
// rồi đổi sang số. Cách này từ chối: "abc", "", "-1", "1.5", "1e3", " 5", và
// tham số lặp (?page=1&page=2, express đưa thành mảng).
// ---------------------------------------------------------------------------

/** Lọc theo mode: đọc được cả "exam" (dữ liệu về sau), dù POST hiện mới nhận "practice". */
export const ATTEMPT_FILTER_MODES = ["practice", "exam"] as const;

// Chặn trang quá lớn: (page - 1) * limit phải nằm trong số nguyên 32-bit để Prisma không lỗi 500.
const MAX_PAGE = 100000;

const intQueryField = (
  name: string,
  label: string,
  min: number,
  max: number,
  maxMessage?: string
) => {
  const invalid = `${name}: ${label} phải là số nguyên dương`;
  return z
    .string({ invalid_type_error: invalid })
    .regex(/^\d+$/, invalid)
    .transform(Number)
    .pipe(
      z
        .number()
        .int(invalid)
        .min(min, invalid)
        .max(max, maxMessage ?? `${name}: ${label} không hợp lệ`)
    );
};

export const listAttemptsQuerySchema = z.object({
  assignmentId: intQueryField(
    "assignmentId",
    "Mã bài giao",
    1,
    MAX_EXERCISE_ID
  ).optional(),
  exerciseId: intQueryField(
    "exerciseId",
    "Mã bài tập",
    1,
    MAX_EXERCISE_ID
  ).optional(),
  mode: z
    .enum(ATTEMPT_FILTER_MODES, {
      errorMap: () => ({
        message: `mode: Chế độ không hợp lệ. Chỉ chấp nhận: ${ATTEMPT_FILTER_MODES.join(", ")}`,
      }),
    })
    .optional(),
  page: intQueryField("page", "Số trang", 1, MAX_PAGE)
    .optional()
    .transform((value) => value ?? 1),
  limit: intQueryField(
    "limit",
    "Số dòng mỗi trang",
    1,
    ATTEMPT_LIST_MAX_LIMIT,
    `limit: Tối đa ${ATTEMPT_LIST_MAX_LIMIT} dòng mỗi trang`
  )
    .optional()
    .transform((value) => value ?? ATTEMPT_LIST_DEFAULT_LIMIT),
});
// Query thừa (vd studentId=...) bị zod bỏ: student_id luôn lấy từ JWT, không nhận từ client.

export type ListAttemptsQuery = z.infer<typeof listAttemptsQuerySchema>;

export const attemptIdParamSchema = z.object({
  id: intQueryField("id", "Mã bài nộp", 1, MAX_EXERCISE_ID),
});

export type AttemptIdParam = z.infer<typeof attemptIdParamSchema>;