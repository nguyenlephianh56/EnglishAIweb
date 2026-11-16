// =====================================================================
// skill-profiles/skill-profiles.refresh.ts — Hàm bọc mỏng: cập nhật hồ sơ sau khi attempt có điểm (T14).
//
// refreshProfileAfterGrading(db, attemptId) là NƠI DUY NHẤT attempts.service gọi để cập nhật hồ sơ.
//  - studentId và skill đọc từ DB theo attempt (attempts.student_id, exercises.skill của bài của
//    attempt), KHÔNG nhận từ client/body.
//  - Best-effort: mọi lỗi (đọc attempt, recomputeSkillProfile) đều được nuốt và chỉ log
//    studentId, skill, mã lỗi. KHÔNG log message lỗi (có thể chứa dữ liệu), errors, bài viết, ai_feedback.
//    Lý do nuốt lỗi: hồ sơ là dữ liệu suy ra, lần tính kế tiếp sẽ tính lại từ DB nên tự đúng.
//  - Hàm KHÔNG kiểm attempt đã có điểm chưa: nơi gọi chịu trách nhiệm chỉ gọi khi attempt VỪA
//    có điểm hợp lệ (xem bảng "nơi → điều kiện gọi" trong Project.md 4c mục 9).
// =====================================================================
import type { Prisma, PrismaClient, Skill } from "@prisma/client";
import { recomputeSkillProfile } from "./skill-profiles.recompute";

type Db = Prisma.TransactionClient | PrismaClient;

/** Mã lỗi an toàn để log: mã Prisma (vd "P2002") hoặc tên lỗi. Không bao giờ dùng message. */
const safeErrorCode = (err: unknown): string => {
  if (typeof err === "object" && err !== null) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
    const name = (err as { name?: unknown }).name;
    if (typeof name === "string" && name.length > 0) return name;
  }
  return "UNKNOWN";
};

export const refreshProfileAfterGrading = async (db: Db, attemptId: number): Promise<void> => {
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
    await recomputeSkillProfile(db, studentId, skill);
  } catch (err) {
    console.error("[skill-profiles] refresh_after_grading_failed", {
      studentId,
      skill,
      code: safeErrorCode(err),
    });
  }
};