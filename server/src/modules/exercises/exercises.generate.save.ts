import { ExerciseSource, ExerciseStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { EXERCISE_SELECT } from "./exercises.service";
import type { GeneratedExerciseDraft } from "./exercises.generate.output.schema";
import type { GenerateExerciseInput } from "./exercises.generate.schema";

/**
 * T11: lưu MỘT bài AI sinh ra thành bản nháp.
 * Chỉ gọi hàm này SAU khi AI + validateExercise đã thành công.
 *
 * - type/skill/level/topic: lấy từ ĐẦU VÀO của người dùng (đã qua Zod ở route),
 *   không lấy từ AI, để AI không tự đổi được.
 * - content/answer/explanation: lấy từ bài AI đã hợp lệ.
 * - source/status/inLibrary/createdById: server tự đặt, không nhận từ AI hay client.
 * - answer null (writing/speaking) -> Prisma.DbNull = NULL thật của SQL, KHÔNG phải JSON "null"
 *   (DB có CHECK chỉ cho phép NULL ở writing/speaking).
 * Lỗi DB được ném nguyên cho controller xử lý (500 chung); hàm này không log gì.
 */
export async function saveGeneratedDraft(
  userId: number,
  input: Pick<GenerateExerciseInput, "type" | "skill" | "level" | "topic">,
  draft: Pick<GeneratedExerciseDraft, "content" | "answer" | "explanation">
) {
  return prisma.exercise.create({
    data: {
      type: input.type,
      skill: input.skill,
      level: input.level,
      topic: input.topic,
      content: draft.content as Prisma.InputJsonValue,
      answer:
        draft.answer === null || draft.answer === undefined
          ? Prisma.DbNull
          : (draft.answer as Prisma.InputJsonValue),
      explanation: draft.explanation,
      source: ExerciseSource.AI,
      status: ExerciseStatus.DRAFT,
      inLibrary: false,
      createdById: userId,
    },
    select: EXERCISE_SELECT,
  });
}