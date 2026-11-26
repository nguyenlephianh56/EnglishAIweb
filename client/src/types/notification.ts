/** GENERAL = loại thông báo backend gửi mà giao diện chưa biết ("deadline", "graded", "teacher_edit" đã biết; "system" và loại khác rơi về GENERAL) */
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
  /** "deadline" | "graded" | "teacher_edit" | "system" (loại lạ vẫn được chấp nhận) */
  type: string;
  message: string;
  read: boolean;
  read_at: string | null;
  created_at: string;
  /** Chỉ có ở thông báo "deadline" */
  assignment_id: number | null;
  /** Chỉ có ở thông báo "graded" và "teacher_edit" */
  attempt_id: number | null;
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
