import { z } from "zod";
import { Level, Skill } from "@prisma/client";
import { EXERCISE_TYPES, type ExerciseType } from "./exercise-content.schema";

/** Các cặp kỹ năng – dạng bài theo Project.md, bảng 4b. */
export const GENERATE_SKILLS_BY_TYPE: Readonly<
  Record<ExerciseType, readonly Skill[]>
> = {
  multiple_choice: [Skill.READING],
  fill_blank: [Skill.FOUNDATION, Skill.READING],
  matching: [Skill.FOUNDATION],
  error_correction: [Skill.WRITING, Skill.FOUNDATION],
  listening_fill: [Skill.LISTENING],
  writing: [Skill.WRITING],
  speaking: [Skill.SPEAKING],
};

/**
 * Body riêng cho POST /api/v1/exercises/generate.
 * Không nhận content, answer hay các field do server quyết định.
 * count: 1–10; matching: 2–10 cặp; error_correction/writing/speaking: 1 đề.
 */
export const generateExerciseSchema = z
  .object(
    {
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
        // Kiểm tra TRƯỚC trim để không bỏ lọt tab/xuống dòng ở đầu hoặc cuối.
        .refine(
          (topic) => !/[\u0000-\u001F\u007F-\u009F]/.test(topic),
          "topic: Chủ đề không được chứa ký tự điều khiển"
        )
        .transform((topic) => topic.trim())
        .pipe(
          z
            .string()
            .min(2, "topic: Chủ đề phải có ít nhất 2 ký tự")
            .max(100, "topic: Chủ đề không được vượt quá 100 ký tự")
        ),
      type: z.enum(EXERCISE_TYPES, {
        errorMap: () => ({
          message: `type: Dạng bài không hợp lệ. Chỉ chấp nhận: ${EXERCISE_TYPES.join(", ")}`,
        }),
      }),
      count: z
        .number({
          required_error: "count: Số lượng là bắt buộc",
          invalid_type_error: "count: Số lượng phải là số",
        })
        .int("count: Số lượng phải là số nguyên")
        .min(1, "count: Số lượng phải từ 1 trở lên")
        .max(10, "count: Số lượng không được vượt quá 10"),
    },
    {
      required_error: "body: Body là bắt buộc",
      invalid_type_error: "body: Body phải là một object JSON",
    }
  )
  .strict("body: Chỉ chấp nhận các field skill, level, topic, type, count")
  .superRefine((data, ctx) => {
    const allowedSkills = GENERATE_SKILLS_BY_TYPE[data.type];
    if (!allowedSkills.includes(data.skill)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["skill"],
        message: `skill: Dạng "${data.type}" chỉ dùng với kỹ năng ${allowedSkills.join(" hoặc ")}`,
      });
    }

    // T1 yêu cầu ít nhất 2 cặp để bài matching có ý nghĩa.
    if (data.type === "matching" && data.count < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["count"],
        message: "count: Dạng matching phải có từ 2 đến 10 cặp",
      });
    }

    // T1 chỉ chứa một sentence/wrong ở error_correction, hoặc một đề Viết/Nói.
    if (
      (data.type === "error_correction" ||
        data.type === "writing" ||
        data.type === "speaking") &&
      data.count !== 1
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["count"],
        message: `count: Dạng ${data.type} chỉ chấp nhận count = 1`,
      });
    }
  });

export type GenerateExerciseInput = z.infer<typeof generateExerciseSchema>;