// =====================================================================
// attempts.review.service.ts — GV/ADMIN đọc chi tiết MỘT bài nộp (T30).
//
//   GET /api/v1/attempts/:id/review  (route ở attempts.review.routes.ts, Bước 3)
//
// Hai phần:
//   findAttemptReview(actor, id) : đọc DB (CHỈ ĐỌC), lọc quyền NGAY TRONG truy vấn
//   buildAttemptReview(row)      : dựng response THUẦN (không đụng DB) để test riêng
//
// Quy tắc đã chốt:
//   - Phạm vi: ADMIN = mọi bài của bài giao (assignment_id khác NULL);
//     TEACHER = chỉ lớp mình chủ nhiệm. Dùng chung attemptAssignmentScope (attempts.scope.ts).
//   - Bài tự luyện (assignment_id NULL), id không tồn tại, lớp GV khác, vai trò khác
//     ADMIN/TEACHER: đều trả null -> route trả CÙNG một 404.
//   - Trả đáp án + giải thích ĐẦY ĐỦ cho GV/ADMIN (kể cả bài đã HIDDEN), không che.
//   - Chỉ lấy đúng các cột trong danh sách trắng: không passwordHash, không email,
//     không createdById... Học sinh chỉ có { id, name }.
//   - Bài chờ AI (writing/speaking, score NULL): vẫn trả 200, grading_status = "PENDING".
//     KHÔNG gọi AI, KHÔNG ghi DB, KHÔNG ghi audit_logs.
//   - Không log bài làm, nhận xét, ai_feedback.
// =====================================================================
import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { finalScoreOf } from "./attempt-list";
import { round2 } from "./attempt-result";
import { attemptAssignmentScope } from "./attempts.scope";

export type AttemptReviewActor = { id: number; role: Role };

/** Danh sách trắng các cột được đọc. Thêm cột nào phải cân nhắc kỹ có lộ dữ liệu không. */
export const attemptReviewSelect = {
  id: true,
  mode: true,
  answer: true,
  submittedAt: true,
  isLate: true,
  score: true,
  maxScore: true,
  teacherScore: true,
  teacherComment: true,
  aiFeedback: true,
  errors: true,
  student: { select: { id: true, name: true } },
  exercise: {
    select: {
      id: true,
      type: true,
      skill: true,
      level: true,
      topic: true,
      content: true,
      answer: true,
      explanation: true,
    },
  },
  assignment: {
    select: {
      id: true,
      dueAt: true,
      class: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.AttemptSelect;

export type AttemptReviewRow = Prisma.AttemptGetPayload<{
  select: typeof attemptReviewSelect;
}>;

export type GradingStatus = "PENDING" | "GRADED";

/** Loại bài do AI chấm (có thể đang chờ AI). */
const AI_GRADED_TYPES = ["writing", "speaking"];

/**
 * "PENDING" khi chưa có điểm AI (score NULL) và bài là writing/speaking.
 * Ngược lại "GRADED". Server tự suy ra, không có cột riêng trong DB.
 */
export const gradingStatusOf = (
  score: number | null,
  exerciseType: string
): GradingStatus =>
  score === null && AI_GRADED_TYPES.includes(exerciseType) ? "PENDING" : "GRADED";

const roundOrNull = (value: number | null): number | null =>
  value === null ? null : round2(value);

/** Dựng response snake_case từ một dòng DB. Hàm thuần. */
export function buildAttemptReview(row: AttemptReviewRow) {
  // finalScoreOf dùng `??` nên teacher_score = 0 vẫn được tính (không bị coi là "không có").
  const finalScore = finalScoreOf(row.score, row.teacherScore);

  return {
    attempt: {
      id: row.id,
      mode: row.mode,
      answer: row.answer,
      submitted_at: row.submittedAt,
      is_late: row.isLate,
      score: roundOrNull(row.score),
      max_score: row.maxScore,
      teacher_score: roundOrNull(row.teacherScore),
      teacher_comment: row.teacherComment,
      final_score: roundOrNull(finalScore),
      ai_feedback: row.aiFeedback,
      errors: row.errors,
      grading_status: gradingStatusOf(row.score, row.exercise.type),
    },
    student: {
      id: row.student.id,
      name: row.student.name,
    },
    exercise: {
      id: row.exercise.id,
      type: row.exercise.type,
      skill: row.exercise.skill,
      level: row.exercise.level,
      topic: row.exercise.topic,
      content: row.exercise.content,
      answer: row.exercise.answer,
      explanation: row.exercise.explanation,
    },
    assignment: row.assignment
      ? {
          id: row.assignment.id,
          due_at: row.assignment.dueAt,
          class: {
            id: row.assignment.class.id,
            name: row.assignment.class.name,
          },
        }
      : null,
  };
}

export type AttemptReview = ReturnType<typeof buildAttemptReview>;

/**
 * Trả chi tiết bài nộp, hoặc null nếu: vai trò không phải ADMIN/TEACHER, id không tồn tại,
 * bài của lớp GV khác, hoặc bài tự luyện. Mọi trường hợp null -> route trả cùng một 404.
 */
export async function findAttemptReview(
  actor: AttemptReviewActor,
  attemptId: number
): Promise<AttemptReview | null> {
  if (actor.role !== Role.ADMIN && actor.role !== Role.TEACHER) return null;

  const row = await prisma.attempt.findFirst({
    where: { id: attemptId, assignment: attemptAssignmentScope(actor) },
    select: attemptReviewSelect,
  });

  return row ? buildAttemptReview(row) : null;
}