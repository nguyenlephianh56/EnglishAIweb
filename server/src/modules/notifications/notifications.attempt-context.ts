import { Role, UserStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";

/** Ngữ cảnh bài nộp dùng để dựng message thông báo chấm điểm (`teacher_edit`, `graded`). */
export interface AttemptNotificationContext {
  topic: string;
  className: string;
}

/**
 * MỘT truy vấn: kiểm HS (đúng người nộp bài, role STUDENT, status ACTIVE) + lấy topic bài + tên lớp.
 * Trả null nếu bài không tồn tại, `studentId` không phải người nộp, hoặc HS không còn ACTIVE/không phải STUDENT.
 * Lỗi DB được ném ra cho nơi gọi xử lý (best-effort ở updateTeacherGrade).
 */
export const findAttemptNotificationContext = async (
  attemptId: number,
  studentId: number
): Promise<AttemptNotificationContext | null> => {
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, studentId },
    select: {
      student: { select: { role: true, status: true } },
      exercise: { select: { topic: true } },
      assignment: { select: { class: { select: { name: true } } } },
    },
  });
  if (attempt === null) return null;
  if (attempt.student.role !== Role.STUDENT || attempt.student.status !== UserStatus.ACTIVE) return null;

  return {
    topic: attempt.exercise.topic,
    className: attempt.assignment?.class.name ?? "",
  };
};