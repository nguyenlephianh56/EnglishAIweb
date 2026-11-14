import type { ProfileRange, ProgressPoint, SkillProfileData, SkillScore } from "../../../types/profile";
import type { SkillKey } from "../../../types/student";

// ============================================================================
// DỮ LIỆU GIẢ cho trang Hồ sơ kỹ năng.
// TODO: nối API thật. Backend hiện CHƯA có GET hồ sơ kỹ năng (bảng skill_profiles đã
// thiết kế: điểm, mức A1-B2, thống kê loại lỗi). Khi có, thay fetchSkillProfile(range)
// bằng lời gọi api/unwrap; hook useSkillProfile() và các component không phải sửa.
// ============================================================================

const SKILL_ORDER: SkillKey[] = ["LISTENING", "SPEAKING", "READING", "WRITING"];
const CURRENT: Record<SkillKey, number> = { LISTENING: 72, SPEAKING: 64, READING: 81, WRITING: 68 };

// Điểm thay đổi theo từng khoảng thời gian
const DELTAS: Record<ProfileRange, Record<SkillKey, number>> = {
  "7d": { LISTENING: 1, SPEAKING: 1, READING: 2, WRITING: 1 },
  "30d": { LISTENING: 4, SPEAKING: 2, READING: 4, WRITING: 4 },
  "90d": { LISTENING: 9, SPEAKING: 6, READING: 8, WRITING: 10 },
};
const OVERALL_DELTA: Record<ProfileRange, number> = { "7d": 2, "30d": 6, "90d": 14 };

function labelsFor(range: ProfileRange): string[] {
  if (range === "7d") return ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  if (range === "30d") return ["Tuần 1", "Tuần 2", "Tuần 3", "Tuần 4"];
  return Array.from({ length: 12 }, (_, i) => `T${i + 1}`);
}

/** Đường tăng đều từ (điểm hiện tại - delta) tới điểm hiện tại, dao động nhẹ (xác định, không ngẫu nhiên) */
function progressFor(range: ProfileRange): ProgressPoint[] {
  const labels = labelsFor(range);
  const n = labels.length;
  return labels.map((label, i) => {
    const point = { label } as ProgressPoint;
    SKILL_ORDER.forEach((skill, k) => {
      const end = CURRENT[skill];
      const start = end - DELTAS[range][skill];
      const wiggle = i === 0 || i === n - 1 ? 0 : Math.round(Math.sin(i * 1.7 + k * 2.1) * 1.5);
      point[skill] = Math.round(start + ((end - start) * i) / (n - 1)) + wiggle;
    });
    return point;
  });
}

export async function fetchSkillProfile(range: ProfileRange): Promise<SkillProfileData> {
  await new Promise((resolve) => setTimeout(resolve, 450)); // giả lập độ trễ mạng

  const skills: SkillScore[] = SKILL_ORDER.map((skill) => ({ skill, score: CURRENT[skill], delta: DELTAS[range][skill] }));

  return {
    hasData: true,
    level: "B1",
    levelLabel: "Trung cấp",
    deltaPoints: OVERALL_DELTA[range],
    radar: [
      { axis: "Nền tảng", value: 78 },
      { axis: "Nghe", value: CURRENT.LISTENING },
      { axis: "Nói", value: CURRENT.SPEAKING },
      { axis: "Viết", value: CURRENT.WRITING },
      { axis: "Đọc", value: CURRENT.READING },
    ],
    xp: { current: 782, target: 1000 },
    skills,
    progress: progressFor(range),
    errorSampleSize: 18,
    errorTypes: [
      { id: "tense", label: "Thì của động từ", percent: 38 },
      { id: "preposition", label: "Giới từ", percent: 25 },
      { id: "word-order", label: "Trật tự từ", percent: 21 },
      { id: "article", label: "Mạo từ a/an/the", percent: 16 },
    ],
    weaknesses: [
      { id: 1, skill: "SPEAKING", title: "Phát âm âm /θ/ và /ð/", description: "Độ chính xác hiện tại: 62%", actionLabel: "Luyện ngay" },
      { id: 2, skill: "WRITING", title: "Thì quá khứ trong bài viết", description: "Bạn mắc lỗi trong 4/6 bài gần nhất", actionLabel: "Ôn tập" },
    ],
  };
}
