import type { HomeData } from "../../../types/student";

// ============================================================================
// DỮ LIỆU GIẢ cho trang Trang chủ học sinh.
// TODO: nối API thật. Khi backend có các endpoint (bài được giao, hồ sơ kỹ năng,
// gợi ý, thông báo chưa đọc, chuỗi ngày học), chỉ cần thay thân hàm fetchHomeData()
// bằng các lời gọi api/unwrap; hook useHomeData() và các component không phải sửa.
// ============================================================================

const HOUR = 60 * 60 * 1000;

/** 20:00 ngày mai (theo giờ máy), để thẻ "Ngày mai" luôn đúng khi chạy thử */
function tomorrowAt(hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export async function fetchHomeData(): Promise<HomeData> {
  await new Promise((resolve) => setTimeout(resolve, 600)); // giả lập độ trễ mạng

  return {
    streak: 12,
    unreadCount: 3,
    assignments: [
      {
        id: 101,
        title: "Nghe hiểu: Một ngày ở trường",
        skill: "LISTENING",
        teacherName: "Cô Thu Hà",
        className: "Lớp 8A2",
        dueAt: new Date(Date.now() + 6 * HOUR).toISOString(),
        status: "TODO",
        questionCount: 10,
        minutes: 15,
      },
      {
        id: 102,
        title: "Viết email cho một người bạn",
        skill: "WRITING",
        teacherName: "Cô Thu Hà",
        className: "Lớp 8A2",
        dueAt: tomorrowAt(20),
        status: "SUBMITTED",
        minWords: 100,
        maxWords: 120,
      },
    ],
    skillProfile: {
      level: "B1",
      levelLabel: "Trung cấp",
      overall: 73,
      monthlyDelta: 6,
      axes: [
        { axis: "Nền tảng", value: 82 },
        { axis: "Nghe", value: 74 },
        { axis: "Nói", value: 58 },
        { axis: "Viết", value: 61 },
        { axis: "Đọc", value: 79 },
      ],
    },
    recommendation: {
      id: 201,
      skill: "SPEAKING",
      title: "Phát âm âm /θ/ và /ð/",
      description: "Bạn thường nhầm hai âm này trong 3 bài gần nhất.",
      level: "A2",
      minutes: 8,
      topic: "Phát âm",
    },
  };
}
