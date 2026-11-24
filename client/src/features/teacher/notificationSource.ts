import { createNotificationApi } from "../shared/notifications/notificationApi";
import type { NotificationSource } from "../shared/notifications/notificationSource";

const api = createNotificationApi(({ assignmentId }) => (assignmentId ? `/teacher/assignments/${assignmentId}` : "/teacher/assignments"));

/** Nguồn thông báo của GIÁO VIÊN: cùng endpoint với học sinh (backend trả thông báo của chính người đăng nhập), thường còn trống. */
export const TEACHER_NOTIFICATIONS: NotificationSource = {
  queryKey: ["teacher", "notifications"],
  ...api,
  basePath: "/teacher/notifications",
  pageDescription: "Các thông báo dành cho thầy/cô.",
  emptyDescription: "Thông báo mới sẽ hiện ở đây khi có.",
  typeLabels: { DEADLINE: "Sắp hết hạn" },
};
