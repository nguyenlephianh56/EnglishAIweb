import { prisma } from "../../config/prisma";
import { findAttemptNotificationContext } from "./notifications.attempt-context";
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
 * Việc bài nộp đã có điểm cuối trước đó do nơi gọi kiểm trước (updateTeacherGrade).
 * Lỗi DB được ném ra cho nơi gọi xử lý (best-effort ở updateTeacherGrade).
 */
export const createTeacherEditNotification = async ({
  attemptId,
  studentId,
  scoreChanged,
  commentChanged,
}: TeacherEditNotifyInput): Promise<boolean> => {
  if (!scoreChanged && !commentChanged) return false;

  const context = await findAttemptNotificationContext(attemptId, studentId);
  if (context === null) return false;

  const message = buildTeacherEditMessage({
    scoreChanged,
    commentChanged,
    topic: context.topic,
    className: context.className,
  });
  if (message === null) return false;

  await prisma.notification.create({
    data: { userId: studentId, type: teacherEditNotificationKey(attemptId), message },
    select: { id: true },
  });
  return true;
};