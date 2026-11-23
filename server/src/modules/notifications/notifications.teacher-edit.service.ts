import { findAttemptNotificationContext } from "./notifications.attempt-context";
import { upsertUnreadAttemptNotification } from "./notifications.attempt-upsert";
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
 * Tạo hoặc gộp thông báo `teacher_edit:<attemptId>` cho HS sau khi transaction chấm điểm commit.
 * Trả true nếu đã ghi; false nếu không đủ điều kiện (không đổi gì, HS không còn ACTIVE/không phải STUDENT...).
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

  const change = { scoreChanged, commentChanged, ...context };
  const message = buildTeacherEditMessage(change);
  if (message === null) return false;

  await upsertUnreadAttemptNotification({
    attemptId,
    studentId,
    type: teacherEditNotificationKey(attemptId),
    message,
    mergeMessage: (previousMessage) => buildTeacherEditMessage(change, previousMessage) ?? message,
  });
  return true;
};