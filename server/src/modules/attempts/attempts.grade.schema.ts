import { Prisma } from "@prisma/client";
import { z } from "zod";

const TEACHER_COMMENT_MAX_LENGTH = 1000;

export const teacherGradeSchema = z
  .object({
    teacher_score: z
      .number()
      .finite()
      .min(0)
      .max(10)
      .transform((score) =>
        new Prisma.Decimal(score).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber()
      )
      .nullable()
      .optional(),
    teacher_comment: z
      .string()
      .trim()
      .min(1)
      .max(TEACHER_COMMENT_MAX_LENGTH)
      .nullable()
      .optional(),
  })
  .strict()
  .refine(
    ({ teacher_score, teacher_comment }) =>
      teacher_score !== undefined || teacher_comment !== undefined,
    "Cần gửi điểm hoặc nhận xét của giáo viên"
  );

export type TeacherGradeInput = z.infer<typeof teacherGradeSchema>;