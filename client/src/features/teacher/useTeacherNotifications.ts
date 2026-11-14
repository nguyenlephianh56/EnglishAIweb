import { useNotificationActions as useActions, useNotificationFeed } from "../shared/notifications/useNotificationFeed";
import { TEACHER_NOTIFICATIONS } from "./notificationSource";

/** Thông báo của giáo viên + số chưa đọc: MỘT hook cho sidebar (badge), chuông và trang Thông báo. */
export const useTeacherNotifications = () => useNotificationFeed(TEACHER_NOTIFICATIONS);

export const useTeacherNotificationActions = () => useActions(TEACHER_NOTIFICATIONS);
