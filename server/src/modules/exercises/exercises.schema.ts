import { z } from "zod";
import { Level, Skill } from "@prisma/client";
import { EXERCISE_TYPES, type ExerciseType } from "./exercise-content.schema";

/**
 * Schema kiểm tra BODY của POST /api/v1/exercises (phần "vỏ" của bài tập).
 *
 * Phân công việc kiểm tra:
 *  - File này: type, skill, level, topic, explanation, publish, và quy tắc skill theo type.
 *  - T1 (validateExercise, gọi ở service): content, answer và kiểm tra chéo content <-> answer.
 *
 * Vì vậy content/answer ở đây chỉ là z.unknown() (cho đi qua nguyên vẹn).
 *
 * Field client gửi thừa (status, source, inLibrary, createdById, ...) sẽ bị Zod
 * tự BỎ khỏi kết quả parse, nên không bao giờ lọt vào dữ liệu lưu DB.
 *
 * Message lỗi luôn bắt đầu bằng "tên_field: ..." vì middleware validate chỉ nối message,
 * không kèm đường dẫn field.
 */

// ---------------------------------------------------------------------------
// Giới hạn
// ---------------------------------------------------------------------------
export const TOPIC_MAX_LENGTH = 200;
export const EXPLANATION_MAX_LENGTH = 5000;

/**
 * Ràng buộc skill theo type (đã chốt). Dạng không có trong bảng này thì skill tự do.
 */
export const SKILL_BY_TYPE: Partial<Record<ExerciseType, Skill>> = {
  listening_fill: Skill.LISTENING,
  writing: Skill.WRITING,
  speaking: Skill.SPEAKING,
};

// ---------------------------------------------------------------------------
// Schema body
// ---------------------------------------------------------------------------
export const createExerciseSchema = z
  .object({
    type: z.enum(EXERCISE_TYPES, {
      errorMap: () => ({
        message: `type: Dạng bài không hợp lệ. Chỉ chấp nhận: ${EXERCISE_TYPES.join(", ")}`,
      }),
    }),

    skill: z.nativeEnum(Skill, {
      errorMap: () => ({
        message: `skill: Kỹ năng không hợp lệ. Chỉ chấp nhận: ${Object.values(Skill).join(", ")}`,
      }),
    }),

    level: z.nativeEnum(Level, {
      errorMap: () => ({
        message: `level: Cấp độ không hợp lệ. Chỉ chấp nhận: ${Object.values(Level).join(", ")}`,
      }),
    }),

    topic: z
      .string({
        required_error: "topic: Chủ đề là bắt buộc",
        invalid_type_error: "topic: Chủ đề phải là chuỗi ký tự",
      })
      .trim()
      .min(1, "topic: Chủ đề không được để trống")
      .max(TOPIC_MAX_LENGTH, `topic: Chủ đề không được vượt quá ${TOPIC_MAX_LENGTH} ký tự`),

    // content/answer do T1 (validateExercise) kiểm tra ở service
    content: z.unknown(),
    answer: z.unknown().optional(),

    // Tùy chọn; chuỗi rỗng (sau trim) hoặc null -> lưu null
    explanation: z
      .string({ invalid_type_error: "explanation: Giải thích phải là chuỗi ký tự" })
      .trim()
      .max(
        EXPLANATION_MAX_LENGTH,
        `explanation: Giải thích không được vượt quá ${EXPLANATION_MAX_LENGTH} ký tự`
      )
      .nullable()
      .optional()
      .transform((value): string | null => (value ? value : null)),

    // Chỉ ADMIN có tác dụng (service quyết định); TEACHER gửi thì bị bỏ qua
    publish: z
      .boolean({ invalid_type_error: "publish: Phải là true hoặc false" })
      .optional(),
  })
  .superRefine((data, ctx) => {
    const requiredSkill = SKILL_BY_TYPE[data.type];
    if (requiredSkill && data.skill !== requiredSkill) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["skill"],
        message: `skill: Dạng "${data.type}" chỉ dùng với kỹ năng ${requiredSkill}`,
      });
    }
  });

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

// ---------------------------------------------------------------------------
// Tham số đường dẫn :id (dùng cho GET/PATCH/DELETE /api/v1/exercises/:id)
// ---------------------------------------------------------------------------
// Số nguyên lớn nhất của cột INT trong PostgreSQL; vượt quá thì Prisma sẽ báo lỗi 500.
const MAX_EXERCISE_ID = 2147483647;

// Dùng regex chỉ cho phép chữ số để loại "abc", "-1", "1.5", "1e3", "" (z.coerce.number()
// sẽ nhận nhầm "" thành 0 và "1e3" thành 1000).
export const exerciseIdParamSchema = z.object({
  id: z
    .string({ required_error: "id: Mã bài tập là bắt buộc" })
    .regex(/^\d+$/, "id: Mã bài tập phải là số nguyên dương")
    .transform(Number)
    .refine(
      (value) => value >= 1 && value <= MAX_EXERCISE_ID,
      "id: Mã bài tập không hợp lệ"
    ),
});

export type ExerciseIdParam = z.infer<typeof exerciseIdParamSchema>;

// ---------------------------------------------------------------------------
// Schema body của PATCH /api/v1/exercises/:id (sửa bài)
// ---------------------------------------------------------------------------
// Chỉ 6 field này được sửa. Mọi field khác client gửi (type, status, inLibrary, source,
// createdById, id, createdAt...) bị Zod tự BỎ khỏi kết quả parse -> không bao giờ vào DB.
// (Thống nhất với POST: field thừa bị bỏ qua, không báo lỗi.)
//
// Field KHÔNG gửi = giữ nguyên giá trị cũ. Vì vậy ở đây không có giá trị mặc định,
// và explanation giữ nguyên undefined (khác POST: POST đổi undefined thành null).
//
// content/answer chỉ là z.unknown(): service sẽ GỘP với dữ liệu cũ rồi kiểm bằng T1.
export const UPDATABLE_FIELDS = [
  "topic",
  "skill",
  "level",
  "content",
  "answer",
  "explanation",
] as const;

export const updateExerciseSchema = z
  .object(
    {
      topic: z
        .string({ invalid_type_error: "topic: Chủ đề phải là chuỗi ký tự" })
        .trim()
        .min(1, "topic: Chủ đề không được để trống")
        .max(TOPIC_MAX_LENGTH, `topic: Chủ đề không được vượt quá ${TOPIC_MAX_LENGTH} ký tự`)
        .optional(),

      skill: z
        .nativeEnum(Skill, {
          errorMap: () => ({
            message: `skill: Kỹ năng không hợp lệ. Chỉ chấp nhận: ${Object.values(Skill).join(", ")}`,
          }),
        })
        .optional(),

      level: z
        .nativeEnum(Level, {
          errorMap: () => ({
            message: `level: Cấp độ không hợp lệ. Chỉ chấp nhận: ${Object.values(Level).join(", ")}`,
          }),
        })
        .optional(),

      content: z.unknown().optional(),
      answer: z.unknown().optional(),

      // null hoặc chuỗi rỗng (sau trim) = xóa giải thích; không gửi = giữ nguyên
      explanation: z
        .string({ invalid_type_error: "explanation: Giải thích phải là chuỗi ký tự" })
        .trim()
        .max(
          EXPLANATION_MAX_LENGTH,
          `explanation: Giải thích không được vượt quá ${EXPLANATION_MAX_LENGTH} ký tự`
        )
        .nullable()
        .optional()
        .transform((value): string | null | undefined =>
          value === undefined ? undefined : value ? value : null
        ),
    },
    {
      required_error: "Body là bắt buộc",
      invalid_type_error: "Body phải là một object JSON",
    }
  )
  .superRefine((data, ctx) => {
    const hasAnyField = UPDATABLE_FIELDS.some((key) => data[key] !== undefined);
    if (!hasAnyField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Cần gửi ít nhất một trường để sửa: ${UPDATABLE_FIELDS.join(", ")}`,
      });
    }
  });

export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;

// Schema body của POST /api/v1/exercises/:id/reject (admin từ chối đề xuất)
export const REJECT_REASON_MAX_LENGTH = 1000;

export const rejectExerciseSchema = z
  .object({
    reason: z
      .string({ invalid_type_error: "reason: Lý do phải là chuỗi ký tự" })
      .trim()
      .max(
        REJECT_REASON_MAX_LENGTH,
        `reason: Lý do không được vượt quá ${REJECT_REASON_MAX_LENGTH} ký tự`
      )
      .nullable()
      .optional()
      .transform((value): string | undefined => (value ? value : undefined)),
  })
  .default({});

export type RejectExerciseInput = z.infer<typeof rejectExerciseSchema>;