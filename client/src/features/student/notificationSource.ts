import { createNotificationApi } from "../shared/notifications/notificationApi";
import type { NotificationSource } from "../shared/notifications/notificationSource";

const api = createNotificationApi(({ assignmentId, attemptId }) =>
  attemptId ? `/student/results/${attemptId}` : assignmentId ? `/student/assigned/${assignmentId}` : "/student/assigned",
);

/** Nguồn thông báo của HỌC SINH (GET /notifications, PATCH /notifications/:id/read, POST /notifications/read-all). */
export const STUDENT_NOTIFICATIONS: NotificationSource = {
  queryKey: ["student", "notifications"],
  ...api,
  basePath: "/student/notifications",
  pageDescription: "Nhắc hạn nộp bài và các thông báo khác dành cho bạn.",
  emptyDescription: "Nhắc hạn nộp bài và thông báo mới sẽ hiện ở đây.",
};
