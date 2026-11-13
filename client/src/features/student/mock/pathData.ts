import type { LearningPath } from "../../../types/path";

// ============================================================================
// DỮ LIỆU GIẢ cho trang Lộ trình học.
// TODO: nối API thật khi backend có lộ trình cá nhân (bảng learning_paths do AI tạo).
// Chỉ cần thay thân fetchLearningPath() bằng lời gọi api/unwrap; hook usePath và
// các component giữ nguyên.
// ============================================================================

export async function fetchLearningPath(): Promise<LearningPath> {
  await new Promise((resolve) => setTimeout(resolve, 600)); // giả lập độ trễ mạng

  return {
    fromLevel: "B1",
    toLevel: "B2",
    weeklyGoal: { done: 4, total: 5 },
    stages: [
      {
        id: 1,
        title: "Ôn nền tảng: thì hiện tại",
        skill: "FOUNDATION",
        reason: "Củng cố nền tảng ngữ pháp trước khi chuyển sang các thì phức tạp hơn.",
        status: "DONE",
        lessons: [
          { id: 11, title: "Hiện tại đơn và hiện tại tiếp diễn", minutes: 10, done: true },
          { id: 12, title: "Hiện tại hoàn thành", minutes: 12, done: true },
          { id: 13, title: "Bài kiểm tra cuối chặng", minutes: 15, done: true },
        ],
      },
      {
        id: 2,
        title: "Đọc hiểu đoạn văn ngắn",
        skill: "READING",
        reason: "Điểm Đọc của bạn cao, nên chặng này giúp bạn giữ vững và mở rộng từ vựng.",
        status: "DONE",
        lessons: [
          { id: 21, title: "The future of cities", minutes: 15, done: true },
          { id: 22, title: "A day in the life", minutes: 12, done: true },
          { id: 23, title: "Tìm ý chính và ý chi tiết", minutes: 10, done: true },
        ],
      },
      {
        id: 3,
        title: "Thì quá khứ trong bài viết",
        skill: "WRITING",
        reason: "Bạn mắc lỗi thì của động từ trong 38% bài gần nhất, nhiều nhất là quá khứ đơn.",
        status: "CURRENT",
        lessons: [
          { id: 31, title: "Quá khứ đơn: động từ bất quy tắc", minutes: 10, done: true },
          { id: 32, title: "Quá khứ đơn và quá khứ tiếp diễn", minutes: 12, done: true },
          { id: 33, title: "Viết đoạn văn kể chuyện ngắn", minutes: 20, done: false },
          { id: 34, title: "Sửa lỗi thì trong đoạn văn", minutes: 15, done: false },
        ],
      },
      {
        id: 4,
        title: "Phát âm /θ/ và /ð/",
        skill: "SPEAKING",
        reason: "Bạn thường nhầm hai âm này trong 3 bài Nói gần nhất.",
        status: "LOCKED",
        lessons: [
          { id: 41, title: "Phân biệt /θ/ và /ð/", minutes: 8, done: false },
          { id: 42, title: "Luyện cặp từ tối thiểu", minutes: 10, done: false },
          { id: 43, title: "Ghi âm và nhận phản hồi từ AI", minutes: 12, done: false },
        ],
      },
      {
        id: 5,
        title: "Nghe hiểu hội thoại đời sống",
        skill: "LISTENING",
        reason: "Chặng cuối giúp bạn nghe tốc độ tự nhiên, cần thiết để đạt B2.",
        status: "LOCKED",
        lessons: [
          { id: 51, title: "Hội thoại ở trường và nơi làm việc", minutes: 15, done: false },
          { id: 52, title: "Nghe lấy thông tin chi tiết", minutes: 12, done: false },
          { id: 53, title: "Bài kiểm tra cuối lộ trình", minutes: 20, done: false },
        ],
      },
    ],
  };
}
