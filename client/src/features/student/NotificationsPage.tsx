import SharedPage from "../shared/notifications/NotificationsPage";
import { STUDENT_NOTIFICATIONS } from "./notificationSource";

/** Trang Thông báo của học sinh (dùng bản chung ở features/shared/notifications). */
export default function NotificationsPage() {
  return <SharedPage source={STUDENT_NOTIFICATIONS} />;
}
