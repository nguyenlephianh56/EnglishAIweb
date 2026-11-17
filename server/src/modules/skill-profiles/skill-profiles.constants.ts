// =====================================================================
// skill-profiles/skill-profiles.constants.ts — Quy tắc hồ sơ kỹ năng (T14, dòng "chốt cửa sổ trượt + ngưỡng").
//
// Đây là NƠI DUY NHẤT chứa các con số của quy tắc. Muốn đổi N, ngưỡng hay MIN_SAMPLES thì chỉ sửa ở đây.
// File này THUẦN: không import env, không import Prisma, nên test chạy được mà không cần .env hay DB.
// (config/env.ts import DEFAULT_SKILL_WINDOW_SIZE từ đây, không phải ngược lại.)
// =====================================================================

/**
 * Mức CEFR của hồ sơ. Cùng 4 giá trị với enum `Level` của Prisma (A1..B2), nên gán qua lại được.
 * Khai báo riêng để hàm thuần không phụ thuộc client Prisma đã generate hay chưa.
 */
export type ProfileLevel = "A1" | "A2" | "B1" | "B2";

/** Thang điểm (khớp WRITING_MAX_SCORE / MAX_SCORE = 10). Điểm ngoài [0, 10] bị coi là không hợp lệ và bị bỏ qua. */
export const PROFILE_SCORE_MIN = 0;
export const PROFILE_SCORE_MAX = 10;

/**
 * Cửa sổ trượt: số điểm GẦN NHẤT của cùng một kỹ năng dùng để tính `score` hồ sơ.
 * Đơn vị: 1 phần tử = 1 điểm đại diện cho 1 bài (điểm đại diện chọn lần nào: dòng T14 kế tiếp).
 * Đây chỉ là mặc định; giá trị chạy thật lấy từ .env SKILL_WINDOW_SIZE (xem config/env.ts).
 */
export const DEFAULT_SKILL_WINDOW_SIZE = 10;

/**
 * Số điểm tối thiểu để được gán mức. Ít hơn thì level = NULL (score vẫn được tính).
 */
export const MIN_SAMPLES = 3;

/**
 * Bảng ngưỡng điểm trung bình → mức, thang 10, so sánh `>=` (biên thuộc mức CAO hơn).
 * Sắp xếp từ CAO xuống THẤP: duyệt từ trên, gặp ngưỡng đầu tiên mà score >= min thì lấy mức đó.
 * Không đạt ngưỡng nào (dưới 4.0) → LOWEST_LEVEL.
 *
 *   score < 4.0        → A1
 *   4.0 <= score < 6.0 → A2
 *   6.0 <= score < 8.0 → B1
 *   score >= 8.0       → B2
 *
 * Hạn chế đã biết: mức chỉ theo điểm trung bình, KHÔNG tính độ khó bài (exercises.level).
 * Vd 8 điểm ở bài A1 và 8 điểm ở bài B2 hiện cho cùng mức B2.
 */
export interface LevelThreshold {
  level: ProfileLevel;
  /** Điểm tối thiểu (>=) để đạt mức này. */
  min: number;
}

export const LEVEL_THRESHOLDS: readonly LevelThreshold[] = [
  { level: "B2", min: 8 },
  { level: "B1", min: 6 },
  { level: "A2", min: 4 },
];

/** Mức khi điểm không đạt ngưỡng nào ở bảng trên. */
export const LOWEST_LEVEL: ProfileLevel = "A1";
/**
 * Số điểm tối đa trong `progress` (đường tiến bộ) mỗi kỹ năng của API hồ sơ (T15).
 * Mỗi điểm = 1 điểm đại diện của 1 bài, lấy các bài gần nhất, trả theo thứ tự cũ → mới.
 * Khác với cửa sổ tính `score` (N = 10): `progress` dài hơn để thấy xu hướng.
 */
export const PROGRESS_MAX_POINTS = 20;