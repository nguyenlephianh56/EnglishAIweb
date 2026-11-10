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