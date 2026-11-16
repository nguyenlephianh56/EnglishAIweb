// =====================================================================
// skill-profiles/skill-profiles.level.ts — Quy đổi điểm hồ sơ → mức A1-B2 (T14, dòng "chốt ngưỡng").
//
// Hàm THUẦN: không DB, không đọc env. Ngưỡng và MIN_SAMPLES nằm ở skill-profiles.constants.ts;
// tham số `opts` chỉ để test (hoặc sau này cấu hình) đổi giá trị mà không sửa hằng số.
// Mức chỉ theo điểm trung bình, KHÔNG tính độ khó bài (hạn chế đã ghi ở constants).
// =====================================================================
import {
  LEVEL_THRESHOLDS,
  LOWEST_LEVEL,
  MIN_SAMPLES,
  PROFILE_SCORE_MAX,
  PROFILE_SCORE_MIN,
  type LevelThreshold,
  type ProfileLevel,
} from "./skill-profiles.constants";

export interface ScoreToLevelOptions {
  /** Số điểm tối thiểu để có mức. Mặc định MIN_SAMPLES. Phải là số nguyên >= 1. */
  minSamples?: number;
  /** Bảng ngưỡng (không cần sắp sẵn, hàm tự xếp cao → thấp). Mặc định LEVEL_THRESHOLDS. */
  thresholds?: readonly LevelThreshold[];
  /** Mức khi không đạt ngưỡng nào. Mặc định LOWEST_LEVEL (A1). */
  lowestLevel?: ProfileLevel;
}

/**
 * Điểm hồ sơ (thang 10) → mức. Trả null (chưa xác định mức) khi:
 *  - `score` là null/undefined, không phải số hữu hạn, hoặc ngoài [0, 10];
 *  - `sampleCount` < minSamples (chưa đủ dữ liệu; NaN/không phải số cũng coi là chưa đủ).
 * Ngược lại: duyệt ngưỡng từ cao xuống thấp, `score >= min` đầu tiên thắng (biên thuộc mức CAO hơn);
 * không đạt ngưỡng nào → lowestLevel.
 *
 * `sampleCount` = số điểm hợp lệ thực tế đã dùng để tính score (selectScores(...).length).
 * `minSamples` sai (không phải số nguyên >= 1) thì ném RangeError: lỗi cấu hình, không phải dữ liệu.
 */
export const scoreToLevel = (
  score: number | null | undefined,
  sampleCount: number,
  opts: ScoreToLevelOptions = {}
): ProfileLevel | null => {
  const minSamples = opts.minSamples ?? MIN_SAMPLES;
  const thresholds = opts.thresholds ?? LEVEL_THRESHOLDS;
  const lowestLevel = opts.lowestLevel ?? LOWEST_LEVEL;

  if (!Number.isInteger(minSamples) || minSamples < 1) {
    throw new RangeError("MIN_SAMPLES phải là số nguyên >= 1.");
  }

  if (
    typeof score !== "number" ||
    !Number.isFinite(score) ||
    score < PROFILE_SCORE_MIN ||
    score > PROFILE_SCORE_MAX
  ) {
    return null;
  }

  if (!(sampleCount >= minSamples)) return null; // cũng bắt NaN

  // Xếp cao → thấp trên bản sao để không phụ thuộc thứ tự bảng và không sửa mảng gốc.
  const sorted = [...thresholds].sort((a, b) => b.min - a.min);
  for (const threshold of sorted) {
    if (score >= threshold.min) return threshold.level;
  }
  return lowestLevel;
};