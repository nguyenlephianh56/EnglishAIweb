import { z } from "zod";
import {
  ASSIGNMENT_LIST_DEFAULT_LIMIT,
  ASSIGNMENT_LIST_MAX_LIMIT,
  ASSIGNMENT_STATUSES,
  MAX_REMIND_HOURS,
  MAX_REMIND_ITEMS,
} from "./assignments.constants";

// Số nguyên lớn nhất của cột INT trong PostgreSQL; vượt quá thì Prisma sẽ báo lỗi 500.
const MAX_INT = 2147483647;

const positiveIdField = (name: string, label: string) =>
  z
    .number({
      required_error: `${name}: ${label} là bắt buộc`,
      invalid_type_error: `${name}: ${label} phải là số nguyên dương`,
    })
    .int(`${name}: ${label} phải là số nguyên dương`)
    .min(1, `${name}: ${label} phải là số nguyên dương`)
    .max(MAX_INT, `${name}: ${label} không hợp lệ`);

// Bỏ trùng rồi sắp giảm dần (mốc nhắc xa hạn nhất đứng trước): [24, 1, 24] -> [24, 1]
const normalizeReminders = (hours: number[]): number[] =>
  [...new Set(hours)].sort((a, b) => b - a);

export const createAssignmentSchema = z.object(
  {
    exerciseId: positiveIdField("exerciseId", "Mã bài tập"),
    classId: positiveIdField("classId", "Mã lớp"),

    // Chuỗi ISO 8601 có múi giờ, vd "2026-12-01T16:59:00Z" hoặc "2026-12-01T23:59:00+07:00".
    // Chuỗi không có múi giờ ("2026-12-01T10:00:00") bị từ chối vì không biết là giờ nào.
    dueAt: z
      .string({
        required_error: "dueAt: Hạn nộp là bắt buộc",
        invalid_type_error: "dueAt: Hạn nộp phải là chuỗi ngày giờ ISO",
      })
      .datetime({
        offset: true,
        message: "dueAt: Hạn nộp phải là ngày giờ ISO 8601 có múi giờ",
      })
      .transform((value) => new Date(value))
      .refine((date) => date.getTime() > Date.now(), {
        message: "dueAt: Hạn nộp phải sau thời điểm hiện tại",
      }),

    // Số giờ nhắc trước hạn. Giới hạn kiểm trên dữ liệu gửi lên, sau đó mới bỏ trùng.
    remindBeforeHours: z
      .array(
        z
          .number({
            invalid_type_error:
              "remindBeforeHours: Mỗi phần tử phải là số nguyên dương",
          })
          .int("remindBeforeHours: Mỗi phần tử phải là số nguyên dương")
          .min(1, "remindBeforeHours: Mỗi phần tử phải là số nguyên dương")
          .max(
            MAX_REMIND_HOURS,
            `remindBeforeHours: Mỗi phần tử tối đa ${MAX_REMIND_HOURS} giờ`
          ),
        { invalid_type_error: "remindBeforeHours: Phải là mảng số nguyên dương" }
      )
      .max(
        MAX_REMIND_ITEMS,
        `remindBeforeHours: Tối đa ${MAX_REMIND_ITEMS} phần tử`
      )
      .optional()
      .transform((value) => normalizeReminders(value ?? [])),
  },
  {
    required_error: "Body là bắt buộc",
    invalid_type_error: "Body phải là một object JSON",
  }
);
// Field thừa (assignedById, id, createdAt...) bị zod bỏ: assigned_by_id luôn lấy từ JWT.

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;


// ---------------------------------------------------------------------------
// GET /assignments
// Query string luôn là CHUỖI, nên đọc bằng regex số nguyên không dấu rồi đổi sang số.
// Cách này từ chối: "abc", "", "-1", "1.5", "1e3", " 5", và tham số lặp (express đưa thành mảng).
// ---------------------------------------------------------------------------

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

export const listAssignmentsQuerySchema = z.object({
  // Chỉ có tác dụng với HS (status là trạng thái của riêng từng HS). GV gửi thì bị bỏ qua.
  status: z
    .enum(ASSIGNMENT_STATUSES, {
      errorMap: () => ({
        message: `status: Trạng thái không hợp lệ. Chỉ chấp nhận: ${ASSIGNMENT_STATUSES.join(", ")}`,
      }),
    })
    .optional(),
  classId: intQueryField("classId", "Mã lớp", 1, MAX_INT).optional(),
  page: intQueryField("page", "Số trang", 1, MAX_PAGE)
    .optional()
    .transform((value) => value ?? 1),
  limit: intQueryField(
    "limit",
    "Số dòng mỗi trang",
    1,
    ASSIGNMENT_LIST_MAX_LIMIT,
    `limit: Tối đa ${ASSIGNMENT_LIST_MAX_LIMIT} dòng mỗi trang`
  )
    .optional()
    .transform((value) => value ?? ASSIGNMENT_LIST_DEFAULT_LIMIT),
});
// Query thừa (vd studentId=...) bị zod bỏ: student_id luôn lấy từ JWT, không nhận từ client.

export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>;

// GET /assignments/:id và /assignments/:id/submissions
export const assignmentIdParamSchema = z.object({
  id: intQueryField("id", "Mã bài giao", 1, MAX_INT),
});

export type AssignmentIdParam = z.infer<typeof assignmentIdParamSchema>;