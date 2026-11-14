import { useNotificationActions as useActions, useNotificationFeed } from "../shared/notifications/useNotificationFeed";
import { STUDENT_NOTIFICATIONS } from "./notificationSource";

export const NOTIFICATIONS_KEY = STUDENT_NOTIFICATIONS.queryKey;

/**
 * Danh sách thông báo của học sinh + số chưa đọc (MỘT nguồn dữ liệu cho sidebar, chuông và trang Thông báo).
 * Logic nằm ở features/shared/notifications; file này giữ nguyên tên hook cũ để các import cũ không hỏng.
 */
export const useNotifications = () => useNotificationFeed(STUDENT_NOTIFICATIONS);

/** Đánh dấu đã đọc cho học sinh (cập nhật lạc quan, lỗi thì hoàn lại) */
export const useNotificationActions = () => useActions(STUDENT_NOTIFICATIONS);
