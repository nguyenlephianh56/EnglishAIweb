import { ExerciseStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { gradeExercise } from "../grading/gradeExercise";
import { buildAttemptResult } from "./attempt-result";
import type { CreateAttemptInput } from "./attempts.schema";

// Lỗi nghiệp vụ theo khuôn chung (statusCode + code); controller đổi thành response chuẩn.
const businessError = (statusCode: number, code: string, message: string) =>
  Object.assign(new Error(message), { statusCode, code });

// Chỉ lấy đúng các field cần để chấm và dựng kết quả.
const EXERCISE_FOR_ATTEMPT_SELECT = {
  id: true,
  type: true,
  skill: true,
  level: true,
  topic: true,
  content: true,
  answer: true,
  explanation: true,
} as const;

/**
 * POST /api/v1/attempts: nộp bài TỰ LUYỆN (assignment_id = NULL).
 *
 * Thứ tự (lỗi ở bước nào thì dừng, KHÔNG tạo attempt):
 *  1. Tìm bài: phải PUBLISHED + in_library. Không có / DRAFT / PROPOSED / HIDDEN /
 *     ngoài thư viện -> cùng một lỗi 404 (không lộ bài chưa công bố).
 *  2. Chấm bằng gradeExercise: dạng không chấm tự động -> 422, bài làm sai hình dạng -> 400.
 *  3. Lưu 1 dòng attempts. Tự luyện không giới hạn số lần nộp.
 *  4. Dựng kết quả; tự luyện được lộ đáp án ngay (4c.4).
 *

 * studentId lấy từ JWT (user.id), input không có studentId/score/errors.
 */
export const submitPracticeAttempt = async (
  user: { id: number },
  input: CreateAttemptInput
) => {
  const exercise = await prisma.exercise.findFirst({
    where: {
      id: input.exerciseId,
      status: ExerciseStatus.PUBLISHED,
      inLibrary: true,
    },
    select: EXERCISE_FOR_ATTEMPT_SELECT,
  });

  if (!exercise) {
    throw businessError(404, "NOT_FOUND", "Không tìm thấy bài tập");
  }

  // Ném lỗi có statusCode + code (422 NOT_AUTO_GRADABLE, 400 VALIDATION_ERROR, ...)
  const grade = gradeExercise(
    exercise.type,
    exercise.content,
    exercise.answer,
    input.answer
  );

  const attempt = await prisma.attempt.create({
    data: {
      studentId: user.id,
      exerciseId: exercise.id,
      assignmentId: null,

      mode: input.mode,
      answer: input.answer as Prisma.InputJsonValue,
      score: grade.score,
      maxScore: grade.maxScore,
      errors: grade.errors as unknown as Prisma.InputJsonValue,
      isLate: false,
      submittedAt: new Date(),
    },
    select: { id: true, score: true, maxScore: true, errors: true },
  });

  return buildAttemptResult(attempt, exercise, { reveal: true });
};