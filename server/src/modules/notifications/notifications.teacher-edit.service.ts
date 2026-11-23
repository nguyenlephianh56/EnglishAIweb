import { Role, UserStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { teacherEditNotificationKey } from "./notifications.constants";
import { buildTeacherEditMessage } from "./notifications.teacher-edit";

/** Thông tin nội bộ do `updateTeacherGrade` trả ra sau khi transaction chấm điểm commit. */
export interface TeacherEditNotifyInput {
  attemptId: number;
  studentId: number;
  scoreChanged: boolean;
  commentChanged: boolean;
}

/**
 * Tạo 1 thông báo `teacher_edit:<attemptId>` cho HS của bài nộp. GỌI SAU KHI transaction chấm điểm đã commit.
 * Trả true nếu đã tạo; false nếu không đủ điều kiện (không đổi gì, HS không còn ACTIVE/không phải STUDENT...).
 * Việc bài nộp đã có điểm (`score` khác null) do nơi gọi kiểm trước (updateTeacherGrade).
 * Lỗi DB được ném ra cho nơi gọi xử lý (best-effort ở updateTeacherGrade).
 */
export const createTeacherEditNotification = async ({
  attemptId,
  studentId,
  scoreChanged,
  commentChanged,
}: TeacherEditNotifyInput): Promise<boolean> => {
  if (!scoreChanged && !commentChanged) return false;

  // MỘT truy vấn: kiểm role/status của HS + lấy topic bài + tên lớp.
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, studentId },
    select: {
      student: { select: { role: true, status: true } },
      exercise: { select: { topic: true } },
      assignment: { select: { class: { select: { name: true } } } },
    },
  });
  if (attempt === null) return false;
  if (attempt.student.role !== Role.STUDENT || attempt.student.status !== UserStatus.ACTIVE) return false;

  const message = buildTeacherEditMessage({
    scoreChanged,
    commentChanged,
    topic: attempt.exercise.topic,
    className: attempt.assignment?.class.name ?? "",
  });
  if (message === null) return false;

  await prisma.notification.create({
    data: { userId: studentId, type: teacherEditNotificationKey(attemptId), message },
    select: { id: true },
  });
  return true;
};