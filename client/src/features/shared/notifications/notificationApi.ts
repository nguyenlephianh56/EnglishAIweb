import axios from "axios";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../../../api/notifications";
import { mapNotification } from "./mapNotification";
import type { NotificationTarget } from "./mapNotification";
import type { AppNotification } from "../../../types/notification";

/** Số thông báo lấy mỗi lần (tối đa của backend); chỉ lấy trang đầu */
const PAGE_LIMIT = 50;

/** Dựng 3 hàm của NotificationSource từ API thật; mọi vai trò dùng chung endpoint, chỉ khác đích khi bấm. */
export function createNotificationApi(buildTo: NotificationTarget) {
  return {
    fetch: async (): Promise<AppNotification[]> => (await listNotifications({ limit: PAGE_LIMIT })).items.map((n) => mapNotification(n, buildTo)),
    markRead: async (id: number): Promise<void> => {
      try {
        await markNotificationRead(id);
      } catch (err) {
        // 404: không còn/không phải của người dùng -> coi như đã xử lý, hook sẽ tải lại danh sách
        if (axios.isAxiosError(err) && err.response?.status === 404) return;
        throw err;
      }
    },
    markAllRead: async (): Promise<void> => {
      await markAllNotificationsRead();
    },
  };
}
