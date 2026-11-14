import SharedBell from "../shared/notifications/NotificationBell";
import { TEACHER_NOTIFICATIONS } from "./notificationSource";

/** Chuông thông báo của giáo viên (dùng bản chung ở features/shared/notifications). */
export default function NotificationBell() {
  return <SharedBell source={TEACHER_NOTIFICATIONS} />;
}
