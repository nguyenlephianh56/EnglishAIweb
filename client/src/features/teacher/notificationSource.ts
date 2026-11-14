import { fetchTeacherNotifications, markAllTeacherNotificationsRead, markTeacherNotificationRead } from "./mock/notificationData";
import type { NotificationSource } from "../shared/notifications/notificationSource";

/**
 * Nguồn thông báo của GIÁO VIÊN (dữ liệu giả). TODO: đổi 3 hàm trong mock/notificationData.ts sang API thật.
 * Dùng lại các loại có sẵn: RESULT = học sinh vừa nộp bài, DEADLINE = bài sắp hết hạn,
 * ASSIGNED = việc cần xử lý (bài cần chấm, học sinh mới vào lớp), AI_TIP = gợi ý cho lớp.
 */
export const TEACHER_NOTIFICATIONS: NotificationSource = {
  queryKey: ["teacher", "notifications"],
  fetch: fetchTeacherNotifications,
  markRead: markTeacherNotificationRead,
  markAllRead: markAllTeacherNotificationsRead,
  basePath: "/teacher/notifications",
  pageDescription: "Bài nộp mới, hạn nộp sắp đến, bài cần chấm và gợi ý từ AI cho các lớp của thầy/cô.",
  emptyDescription: "Bài nộp mới, bài cần chấm và nhắc hạn sẽ hiện ở đây.",
  typeLabels: { RESULT: "Bài nộp mới", DEADLINE: "Sắp hết hạn", ASSIGNED: "Cần xử lý", AI_TIP: "Gợi ý AI" },
};
