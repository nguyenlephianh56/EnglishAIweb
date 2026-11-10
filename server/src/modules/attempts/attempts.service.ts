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

type ExerciseForAttempt = Prisma.ExerciseGetPayload<{
  select: typeof EXERCISE_FOR_ATTEMPT_SELECT;
}>;

/** Kết quả của bước "tìm bài + kiểm quyền": bài cần chấm và thông tin bài giao (nếu có). */
interface ResolvedTarget {
  exercise: ExerciseForAttempt;
  assignment: { id: number; dueAt: Date } | null;
}

/** Nhánh TỰ LUYỆN: bài phải PUBLISHED + in_library, nếu không -> 404. */
const resolvePracticeTarget = async (
  input: CreateAttemptInput
): Promise<ResolvedTarget> => {
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
  return { exercise, assignment: null };
};

/**
 * Nhánh BÀI GIAO. Thứ tự (lỗi ở bước nào thì dừng):
 *  1. Assignment phải tồn tại VÀ HS phải là thành viên lớp của nó.
 *     Hai trường hợp dùng chung MỘT lỗi 404 để không lộ assignment của lớp khác.
 *  2. exerciseId (nếu body có) phải khớp assignment.exercise_id, sai -> 400.
 *  3. Bài lấy theo assignment: KHÔNG bắt buộc PUBLISHED/in_library; chỉ chặn HIDDEN (404).
 */
const resolveAssignmentTarget = async (
  user: { id: number },
  assignmentId: number,
  exerciseIdFromBody: number | undefined
): Promise<ResolvedTarget> => {
  const notFound = () =>
    businessError(404, "NOT_FOUND", "Không tìm thấy bài giao");

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, classId: true, exerciseId: true, dueAt: true },
  });
  if (!assignment) throw notFound();

  const membership = await prisma.classMember.findUnique({
    where: {
      classId_studentId: { classId: assignment.classId, studentId: user.id },
    },
    select: { studentId: true },
  });
  if (!membership) throw notFound();

  if (
    exerciseIdFromBody !== undefined &&
    exerciseIdFromBody !== assignment.exerciseId
  ) {
    throw businessError(
      400,
      "VALIDATION_ERROR",
      "exerciseId: Không khớp với bài của bài giao này"
    );
  }

  const exercise = await prisma.exercise.findFirst({
    where: {
      id: assignment.exerciseId,
      status: { not: ExerciseStatus.HIDDEN },
    },
    select: EXERCISE_FOR_ATTEMPT_SELECT,
  });
  if (!exercise) {
    throw businessError(404, "NOT_FOUND", "Không tìm thấy bài tập");
  }

  return {
    exercise,
    assignment: { id: assignment.id, dueAt: assignment.dueAt },
  };
};

/**
 * POST /api/v1/attempts: nộp bài. Có assignmentId -> bài giao, không có -> tự luyện.
 *
 * Thứ tự (lỗi ở bước nào thì dừng, KHÔNG tạo attempt):
 *  1. Tìm bài + kiểm quyền (hai nhánh ở trên).
 *  2. Chấm bằng gradeExercise: dạng không chấm tự động -> 422, bài làm sai hình dạng -> 400.
 *  3. Lưu 1 dòng attempts.
 *  4. Dựng kết quả: tự luyện lộ đáp án ngay; bài giao che đáp án (4c.4).
 *
 * studentId lấy từ JWT (user.id); input không có studentId/score/errors/is_late/submitted_at.
 *
 * Thời gian: lấy `now` MỘT LẦN bằng giờ server (không tin client). Cùng một `now` dùng cho
 * submitted_at, is_late (= now > dueAt, đúng hạn chót thì chưa trễ) và reveal.
 * Nộp trễ vẫn được chấm và lưu, chỉ đánh dấu is_late = true. Tự luyện luôn is_late = false.
 *
 * Lộ đáp án (4c.4): tự luyện lộ ngay; bài giao chỉ lộ khi đã quá hạn (now > dueAt).
 * Chưa quá hạn -> response không có answer/explanation/errors[].correction.
 */
export const submitAttempt = async (
  user: { id: number },
  input: CreateAttemptInput
) => {
  const { exercise, assignment } =
    input.assignmentId === undefined
      ? await resolvePracticeTarget(input)
      : await resolveAssignmentTarget(user, input.assignmentId, input.exerciseId);

  // Một mốc thời gian duy nhất cho cả lần nộp (giờ server).
  const now = new Date();
  // Đã quá hạn nộp? Tự luyện không có hạn nên luôn false.
  const pastDue =
    assignment !== null && now.getTime() > assignment.dueAt.getTime();
  const isLate = pastDue;

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
      assignmentId: assignment ? assignment.id : null,
      mode: input.mode,
      answer: input.answer as Prisma.InputJsonValue,
      score: grade.score,
      maxScore: grade.maxScore,
      errors: grade.errors as unknown as Prisma.InputJsonValue,
      isLate,
      submittedAt: now,
    },
    select: { id: true, score: true, maxScore: true, errors: true },
  });

  // Tự luyện (assignment === null): lộ ngay. Bài giao: chỉ lộ khi đã quá hạn.
  const reveal = assignment === null || pastDue;
  return buildAttemptResult(attempt, exercise, { reveal });
};