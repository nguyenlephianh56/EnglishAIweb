import type { AppNotification } from "../../../types/notification";

// ============================================================================
// DỮ LIỆU GIẢ cho Thông báo của GIÁO VIÊN.
// TODO: nối API thật khi backend có endpoint thông báo (GET danh sách, đánh dấu đã đọc,
// đánh dấu tất cả đã đọc). Chỉ cần thay thân 3 hàm export dưới đây bằng lời gọi api/unwrap;
// nguồn (notificationSource.ts), hook và component giữ nguyên.
// Dữ liệu được giữ trong bộ nhớ nên "đã đọc" còn hiệu lực đến khi tải lại trang.
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
      type: "RESULT",
      title: "Học sinh vừa nộp bài “Viết email cho một người bạn”",
      description: "Nguyễn Minh Anh • Lớp 8A2 • nộp trước hạn 2 giờ",
      createdAt: ago(12 * MIN),
      read: false,
      to: "/teacher/assignments",
    },
    {
      id: 2,
      type: "ASSIGNED",
      title: "Có 7 bài cần chấm",
      description: "Bài Viết đã nộp, đang chờ thầy/cô xem lại điểm AI.",
      createdAt: ago(40 * MIN),
      read: false,
      to: "/teacher/grading",
    },
    {
      id: 3,
      type: "DEADLINE",
      title: "Bài “At the weekend” sắp hết hạn",
      description: "Còn khoảng 5 giờ, mới có 22/30 học sinh nộp • Lớp 7B1",
      createdAt: ago(3 * HOUR),
      read: false,
      to: "/teacher/assignments",
    },
    {
      id: 4,
      type: "ASSIGNED",
      title: "Học sinh mới vào lớp",
      description: "Trần Gia Bảo vừa tham gia Luyện thi vào 10 bằng mã lớp.",
      createdAt: ago(6 * HOUR),
      read: true,
      to: "/teacher/classes",
    },
    {
      id: 5,
      type: "AI_TIP",
      title: "AI gợi ý cho lớp 8B4",
      description: "Nhiều học sinh hay sai thì hiện tại hoàn thành. Nên giao thêm bài ôn ngữ pháp.",
      createdAt: daysAgoAt(1, 15, 30),
      read: true,
      to: "/teacher/analytics",
    },
    {
      id: 6,
      type: "RESULT",
      title: "Học sinh vừa nộp bài “Describe your hometown”",
      description: "Lê Thảo Vy • Lớp 8A2",
      createdAt: daysAgoAt(1, 9, 10),
      read: true,
      to: "/teacher/assignments",
    },
    {
      id: 7,
      type: "DEADLINE",
      title: "Bài “Daily routines” đã hết hạn",
      description: "28/32 học sinh đã nộp • Lớp 8A2. Còn 4 học sinh chưa nộp.",
      createdAt: daysAgoAt(3, 20, 5),
      read: true,
      to: "/teacher/assignments",
    },
    {
      id: 8,
      type: "ASSIGNED",
      title: "Có 3 bài cần chấm",
      description: "Bài Nói đã nộp, đang chờ thầy/cô nhận xét.",
      createdAt: daysAgoAt(5, 17, 45),
      read: true,
      to: "/teacher/grading",
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
export async function fetchTeacherNotifications(): Promise<AppNotification[]> {
  await delay(400); // giả lập độ trễ mạng
  return getStore()
    .map((n) => ({ ...n }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function markTeacherNotificationRead(id: number): Promise<void> {
  await delay(150);
  const found = getStore().find((n) => n.id === id);
  if (found) found.read = true;
}

export async function markAllTeacherNotificationsRead(): Promise<void> {
  await delay(200);
  getStore().forEach((n) => {
    n.read = true;
  });
}
