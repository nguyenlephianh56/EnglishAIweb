import type { AppNotification, NotificationType } from "../../../types/notification";

/**
 * Mô tả MỘT nguồn thông báo (học sinh, giáo viên...): dữ liệu lấy từ đâu, đánh dấu đã đọc thế nào,
 * trang "Xem tất cả" nằm ở đâu. Các component và hook dùng chung chỉ làm việc qua đối tượng này,
 * nên thêm vai trò mới chỉ cần khai báo thêm một nguồn.
 */
export interface NotificationSource {
  /** Khóa cache của TanStack Query. Mỗi vai trò một khóa riêng. */
  queryKey: readonly string[];
  fetch: () => Promise<AppNotification[]>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  /** Trang danh sách đầy đủ, ví dụ "/student/notifications" (đích của "Xem tất cả thông báo") */
  basePath: string;
  /** Dòng phụ đề dưới tiêu đề trang Thông báo */
  pageDescription: string;
  /** Dòng gợi ý khi chưa có thông báo nào (tab "Tất cả") */
  emptyDescription: string;
  /** Đổi nhãn đọc cho trình đọc màn hình theo loại (mặc định dùng nhãn của học sinh) */
  typeLabels?: Partial<Record<NotificationType, string>>;
}
