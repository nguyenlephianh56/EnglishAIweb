// =====================================================================
// attempts.scope.ts — Điều kiện PHẠM VI "GV chủ lớp / ADMIN" cho truy vấn ĐỌC attempts.
//
// Một nơi duy nhất cho điều kiện lọc bằng Prisma, dùng chung cho:
//   - T27 `findSuggestAttempt` (gợi ý nhận xét),
//   - T30 review bài nộp (GET /attempts/:id/review).
// (T20 `lockGradeAttempt` vẫn là SQL thô có FOR UPDATE vì cần khóa dòng khi ghi;
//  test `attempts.suggest.scope.db.test.ts` chứng minh nó cho cùng kết quả phân quyền.)
//
// Ý nghĩa:
//   - ADMIN: mọi attempt CÓ assignment (bài giao); bài tự luyện (assignment_id NULL) bị loại.
//   - TEACHER: attempt có assignment thuộc lớp có classes.teacher_id = actor.id.
// Nơi gọi PHẢI tự chặn vai trò khác ADMIN/TEACHER (route đã requireRole; service trả null).
// Lọc nằm TRONG truy vấn, không đọc rồi mới so sánh.
// =====================================================================
import { Prisma, Role } from "@prisma/client";

export type AttemptScopeActor = { id: number; role: Role };

export const attemptAssignmentScope = (
  actor: AttemptScopeActor,
): Prisma.AttemptWhereInput["assignment"] =>
  actor.role === Role.ADMIN
    ? { isNot: null }
    : { is: { class: { teacherId: actor.id } } };