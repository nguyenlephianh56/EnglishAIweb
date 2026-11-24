import { findAttemptNotificationContext } from "./notifications.attempt-context";
import { upsertUnreadAttemptNotification } from "./notifications.attempt-upsert";
import { gradedNotificationKey } from "./notifications.constants";
import { buildGradedMessage } from "./notifications.graded";

/** Thông tin nội bộ do `updateTeacherGrade` trả ra sau khi transaction chấm điểm commit. */
export interface GradedNotifyInput {
  attemptId: number;
  studentId: number;
}

/**
 * Tạo hoặc làm mới thông báo `graded:<attemptId>` cho HS sau khi transaction chấm điểm commit.
 * Trả true nếu đã ghi; false nếu không đủ điều kiện (HS không còn ACTIVE/không phải STUDENT, sai người nộp, bài không tồn tại).
 * Việc "lần đầu bài có điểm cuối nhờ GV" do nơi gọi kiểm trước (updateTeacherGrade).
 * Lỗi DB được ném ra cho nơi gọi xử lý (best-effort ở updateTeacherGrade).
 */
export const createGradedNotification = async ({
  attemptId,
  studentId,
}: GradedNotifyInput): Promise<boolean> => {
  const context = await findAttemptNotificationContext(attemptId, studentId);
  if (context === null) return false;

  await upsertUnreadAttemptNotification({
    attemptId,
    studentId,
    type: gradedNotificationKey(attemptId),
    message: buildGradedMessage(context),
  });
  return true;
};