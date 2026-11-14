import type { AppNotification } from "../../../types/notification";

// ============================================================================
// DỮ LIỆU GIẢ cho Thông báo của học sinh.
// TODO: nối API thật khi backend có bảng/endpoint thông báo (GET danh sách,
// PATCH đánh dấu đã đọc, PATCH đánh dấu tất cả đã đọc). Chỉ cần thay thân 3 hàm
// dưới đây bằng lời gọi api/unwrap; hook useNotifications và các component giữ nguyên.
// Dữ liệu giả được giữ trong bộ nhớ nên đánh dấu "đã đọc" còn hiệu lực đến khi tải lại trang.
// ============================================================================

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

/** Giờ cụ thể của ngày cách đây `days` ngày */
function daysAgoAt(days: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function seed(): AppNotification[] {
  return [
    {
      id: 1,
      type: "DEADLINE",
      title: "Bài “Nghe hiểu: Một ngày ở trường” sắp đến hạn",
      description: "Còn khoảng 6 giờ. Hãy hoàn thành trước 20:00 hôm nay nhé.",
      createdAt: ago(25 * MIN),
      read: false,
      to: "/student/assigned?status=NOT_STARTED",
    },
    {
      id: 2,
      type: "ASSIGNED",
      title: "Cô Thu Hà vừa giao bài mới",
      description: "Viết email cho một người bạn • Lớp 8A2",
      createdAt: ago(2 * HOUR),
      read: false,
      to: "/student/assigned",
    },
    {
      id: 3,
      type: "AI_TIP",
      title: "AI gợi ý: ôn lại phát âm /θ/ và /ð/",
      description: "Bạn thường nhầm hai âm này trong 3 bài gần nhất. Đã thêm vào lộ trình của bạn.",
      createdAt: ago(5 * HOUR),
      read: false,
      to: "/student/path",
    },
    {
      id: 4,
      type: "RESULT",
      title: "Bài “At the weekend” đã có kết quả",
      description: "Điểm cao nhất của bạn: 8,5. Bấm để xem lại bài đã nộp.",
      createdAt: daysAgoAt(1, 14, 5),
      read: true,
      to: "/student/assigned?status=SUBMITTED",
    },
    {
      id: 5,
      type: "DEADLINE",
      title: "Nhắc hạn: Đọc hiểu “The future of cities”",
      description: "Hạn nộp vào 20:00 hôm qua. Bạn có thể làm bù nếu giáo viên cho phép.",
      createdAt: daysAgoAt(1, 8, 0),
      read: true,
      to: "/student/assigned?status=OVERDUE",
    },
    {
      id: 6,
      type: "ASSIGNED",
      title: "Cô Thu Hà giao bài “Describe your hometown”",
      description: "Bài Nói • Lớp 8A2",
      createdAt: daysAgoAt(3, 9, 30),
      read: true,
      to: "/student/assigned",
    },
    {
      id: 7,
      type: "RESULT",
      title: "Bài “Daily routines” đã có kết quả",
      description: "Bạn đạt 9/10. Làm tốt lắm!",
      createdAt: daysAgoAt(5, 16, 40),
      read: true,
      to: "/student/assigned?status=SUBMITTED",
    },
    {
      id: 8,
      type: "AI_TIP",
      title: "Lộ trình học của bạn đã được cập nhật",
      description: "AI đã điều chỉnh các chặng dựa trên kết quả các bài gần đây.",
      createdAt: daysAgoAt(6, 20, 15),
      read: true,
      to: "/student/path",
    },
  ];
}

let store: AppNotification[] | null = null;
function getStore(): AppNotification[] {
  if (!store) store = seed();
  return store;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Mới nhất trước */
export async function fetchNotifications(): Promise<AppNotification[]> {
  await delay(500); // giả lập độ trễ mạng
  return getStore()
    .map((n) => ({ ...n }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function markNotificationRead(id: number): Promise<void> {
  await delay(150);
  const found = getStore().find((n) => n.id === id);
  if (found) found.read = true;
}

export async function markAllNotificationsRead(): Promise<void> {
  await delay(200);
  getStore().forEach((n) => {
    n.read = true;
  });
}
