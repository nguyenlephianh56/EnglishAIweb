import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "./mock/notificationData";
import type { NotificationSource } from "../shared/notifications/notificationSource";

/** Nguồn thông báo của HỌC SINH. TODO: đổi 3 hàm trong mock/notificationData.ts sang API thật. */
export const STUDENT_NOTIFICATIONS: NotificationSource = {
  queryKey: ["student", "notifications"],
  fetch: fetchNotifications,
  markRead: markNotificationRead,
  markAllRead: markAllNotificationsRead,
  basePath: "/student/notifications",
  pageDescription: "Nhắc hạn, bài mới, kết quả và gợi ý từ AI dành cho bạn.",
  emptyDescription: "Nhắc hạn, bài mới và kết quả sẽ hiện ở đây.",
};
