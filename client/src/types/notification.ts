/** GENERAL = loại thông báo backend gửi mà giao diện chưa biết (hiện backend mới có "deadline") */
export type NotificationType = "DEADLINE" | "ASSIGNED" | "RESULT" | "AI_TIP" | "GENERAL";

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

/** Một thông báo đúng như backend trả về (GET /notifications) */
export interface BackendNotification {
  id: number;
  /** Hiện chỉ có "deadline" */
  type: string;
  message: string;
  read: boolean;
  read_at: string | null;
  created_at: string;
  assignment_id: number | null;
}

export interface NotificationListParams {
  /** 1..50, mặc định 20 */
  limit?: number;
  /** next_cursor của trang trước */
  cursor?: number;
  unread?: boolean;
}

export interface NotificationListResult {
  items: BackendNotification[];
  next_cursor: number | null;
  unread_count: number;
}
