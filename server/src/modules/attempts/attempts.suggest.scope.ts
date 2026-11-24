// =====================================================================
// attempts.suggest.scope.ts — Truy vấn ĐỌC phạm vi cho "Gợi ý nhận xét" (T27).
//
// Cùng điều kiện phạm vi với `lockGradeAttempt` của T20 (attempts.grade.service.ts):
//   attempts INNER JOIN assignments INNER JOIN classes, và
//   ADMIN (mọi lớp) HOẶC TEACHER với classes.teacher_id = userId.
// Khác T20 ở chỗ: chỉ ĐỌC (không FOR UPDATE, không ghi) và chỉ chọn đúng các cột AI cần.
//
//   - Bài tự luyện (assignment_id NULL), bài nộp không tồn tại, bài của lớp GV khác,
//     vai trò khác ADMIN/TEACHER: đều trả null -> route trả CÙNG một 404.
//   - Lọc nằm NGAY TRONG truy vấn (không đọc rồi mới so sánh) để không lộ dữ liệu ngoài phạm vi.
//   - KHÔNG chọn: student_id, tên/email, exercises.answer, exercises.explanation,
//     teacher_comment, ghi chú/ID nào khác ngoài phần AI cần.
// Test `attempts.suggest.scope.db.test.ts` chứng minh hai nơi cho cùng kết quả phân quyền.
// =====================================================================
import { Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { attemptAssignmentScope } from "./attempts.scope";

export type SuggestActor = { id: number; role: Role };

export const suggestAttemptSelect = {
  answer: true,
  score: true,
  teacherScore: true,
  aiFeedback: true,
  errors: true,
  exercise: { select: { type: true, skill: true, level: true, content: true } },
} as const;

export async function findSuggestAttempt(actor: SuggestActor, attemptId: number) {
  if (actor.role !== Role.ADMIN && actor.role !== Role.TEACHER) return null;

  return prisma.attempt.findFirst({
    where: {
      id: attemptId,
      assignment: attemptAssignmentScope(actor),
    },
    select: suggestAttemptSelect,
  });
}