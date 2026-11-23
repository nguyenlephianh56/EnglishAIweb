import { api, unwrap } from "./client";
import type { BackendNotification, NotificationListParams, NotificationListResult } from "../types/notification";

/** GET /notifications: thông báo của chính người đăng nhập (mọi vai trò), mới nhất trước. */
export const listNotifications = (params: NotificationListParams = {}) => unwrap<NotificationListResult>(api.get("/notifications", { params }));

/** PATCH /notifications/:id/read. 404 NOT_FOUND nếu thông báo không phải của người dùng. */
export const markNotificationRead = (id: number) => unwrap<BackendNotification>(api.patch(`/notifications/${id}/read`));

/** POST /notifications/read-all: body phải là {} (backend không nhận gì khác). */
export const markAllNotificationsRead = () => unwrap<{ updated: number }>(api.post("/notifications/read-all", {}));
