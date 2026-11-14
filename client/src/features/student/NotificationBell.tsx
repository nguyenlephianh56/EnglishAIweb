import SharedBell from "../shared/notifications/NotificationBell";
import { STUDENT_NOTIFICATIONS } from "./notificationSource";

/** Chuông thông báo của học sinh (dùng bản chung ở features/shared/notifications). */
export default function NotificationBell() {
  return <SharedBell source={STUDENT_NOTIFICATIONS} />;
}
