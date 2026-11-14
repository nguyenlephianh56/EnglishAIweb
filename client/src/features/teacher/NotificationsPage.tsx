import SharedPage from "../shared/notifications/NotificationsPage";
import { TEACHER_NOTIFICATIONS } from "./notificationSource";

/** Trang /teacher/notifications (dùng bản chung ở features/shared/notifications). */
export default function NotificationsPage() {
  return <SharedPage source={TEACHER_NOTIFICATIONS} />;
}
