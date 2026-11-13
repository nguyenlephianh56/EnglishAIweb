export type NotificationType = "DEADLINE" | "ASSIGNED" | "RESULT" | "AI_TIP";

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  description: string;
  /** Thời điểm tạo, dạng ISO 8601 */
  createdAt: string;
  read: boolean;
  /** Trang mở ra khi bấm vào thông báo */
  to: string;
}
