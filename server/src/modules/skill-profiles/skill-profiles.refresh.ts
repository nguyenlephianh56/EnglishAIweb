// =====================================================================
// skill-profiles/skill-profiles.refresh.ts — Cập nhật hồ sơ sau khi điểm cuối thay đổi (T14).
//
// refreshProfileAfterGrading(db, attemptId) là NƠI DUY NHẤT attempts.service gọi để cập nhật hồ sơ.
//  - studentId và skill đọc từ DB theo attempt (attempts.student_id, exercises.skill của bài của
//    attempt), KHÔNG nhận từ client/body.
//  - Best-effort: mọi lỗi (đọc attempt, recomputeSkillProfile) đều được nuốt và chỉ log
//    studentId, skill, mã lỗi. KHÔNG log message lỗi (có thể chứa dữ liệu), errors, bài viết, ai_feedback.
//    Lý do nuốt lỗi: hồ sơ là dữ liệu suy ra, lần tính kế tiếp sẽ tính lại từ DB nên tự đúng.
//  - Nơi gọi chịu trách nhiệm chỉ refresh khi có điểm mới hoặc khi giáo viên đổi hay gỡ điểm.
// =====================================================================
import { errorCodeForLog } from "../../utils/error-code-for-log";
import type { Prisma, PrismaClient, Skill } from "@prisma/client";
import { recomputeSkillProfile, type RecomputeOptions } from "./skill-profiles.recompute";

type Db = Prisma.TransactionClient | PrismaClient;

export const refreshProfileAfterGrading = async (
  db: Db,
  attemptId: number,
  ...options: [options?: RecomputeOptions]
): Promise<void> => {
  let studentId: number | undefined;
  let skill: Skill | undefined;
  try {
    const row = await db.attempt.findUnique({
      where: { id: attemptId },
      select: { studentId: true, exercise: { select: { skill: true } } },
    });
    if (row === null) return; // attempt không còn: không có gì để cập nhật

    studentId = row.studentId;
    skill = row.exercise.skill;
    await recomputeSkillProfile(db, studentId, skill, ...options);
  } catch (err) {
    console.error("[skill-profiles] refresh_after_grading_failed", {
      studentId,
      skill,
      code: errorCodeForLog(err),
    });
  }
};