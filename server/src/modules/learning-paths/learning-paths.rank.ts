// =====================================================================
// learning-paths/learning-paths.rank.ts — Xếp kỹ năng cần luyện + tìm loại lỗi nổi bật (T24).
//
// Hàm THUẦN: không DB, không đọc env. Đầu vào là các dòng `skill_profiles` đã đọc sẵn.
//
// QUY TẮC XẾP (Project.md 4c mục 11):
//  - Kỹ năng CÓ điểm xếp trước, điểm TĂNG dần (yếu nhất trước); hòa điểm theo thứ tự enum.
//  - Kỹ năng CHƯA có dữ liệu (không có dòng hồ sơ) xếp SAU, theo thứ tự enum.
//  - Luôn đủ 5 kỹ năng (kể cả FOUNDATION).
//  - Mức mục tiêu = `level` hiện tại của hồ sơ; null/không có hồ sơ thì A1. Không mở rộng sang mức khác.
// =====================================================================
import type { ProfileLevel } from "../skill-profiles/skill-profiles.constants";
import { PROFILE_SKILL_ORDER } from "../skill-profiles/skill-profiles.schema";
import {
  DEFAULT_TARGET_LEVEL,
  ERROR_TYPE_PATTERN,
  RECOMMEND_REASONS,
  type RecommendReason,
} from "./learning-paths.constants";

/** Một dòng `skill_profiles` (phần cần dùng). `errorStats` là JSON tự do trong DB nên để `unknown`. */
export interface ProfileRowInput {
  skill: string;
  score: number;
  level: ProfileLevel | null;
  errorStats: unknown;
}

export interface RankedSkill {
  skill: string;
  /** Mức mục tiêu để chọn bài (level hiện tại, hoặc A1). */
  level: ProfileLevel;
  reason: RecommendReason;
  /** Loại lỗi nhiều nhất của kỹ năng, hoặc null. */
  focusErrorType: string | null;
}

/**
 * Loại lỗi nhiều nhất trong `error_stats` ({ "grammar:tense": 3, ... }).
 *  - Chỉ xét key đúng dạng `nhóm` hoặc `nhóm:chi_tiết` (ERROR_TYPE_PATTERN) và số lần là số hữu hạn > 0.
 *  - Hòa số lần: lấy key nhỏ hơn theo thứ tự chữ cái (để kết quả luôn giống nhau).
 *  - Không có gì hợp lệ (rỗng, null, mảng, kiểu lạ) -> null.
 */
export const pickFocusErrorType = (errorStats: unknown): string | null => {
  if (typeof errorStats !== "object" || errorStats === null || Array.isArray(errorStats)) return null;

  let bestType: string | null = null;
  let bestCount = 0;
  for (const [type, count] of Object.entries(errorStats)) {
    if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) continue;
    if (!ERROR_TYPE_PATTERN.test(type)) continue;
    if (count > bestCount || (count === bestCount && bestType !== null && type < bestType)) {
      bestType = type;
      bestCount = count;
    }
  }
  return bestType;
};

/** Điểm có dùng để xếp được không (số hữu hạn). Điểm hỏng coi như chưa có dữ liệu. */
const hasUsableScore = (row: ProfileRowInput | undefined): row is ProfileRowInput =>
  row !== undefined && typeof row.score === "number" && Number.isFinite(row.score);

/**
 * Xếp 5 kỹ năng theo quy tắc ở đầu file. Không sửa đầu vào.
 * `order` mặc định PROFILE_SKILL_ORDER (LISTENING, SPEAKING, READING, WRITING, FOUNDATION).
 */
export const rankSkills = (
  profiles: readonly ProfileRowInput[],
  order: readonly string[] = PROFILE_SKILL_ORDER
): RankedSkill[] => {
  // Nếu (bất ngờ) có hai dòng cùng kỹ năng, lấy dòng đầu tiên (DB có UNIQUE nên không xảy ra).
  const bySkill = new Map<string, ProfileRowInput>();
  for (const row of profiles) {
    if (!bySkill.has(row.skill)) bySkill.set(row.skill, row);
  }

  const withData: Array<{ skill: string; row: ProfileRowInput; position: number }> = [];
  const noData: string[] = [];
  order.forEach((skill, position) => {
    const row = bySkill.get(skill);
    if (hasUsableScore(row)) withData.push({ skill, row, position });
    else noData.push(skill);
  });

  // Điểm tăng dần; hòa điểm thì theo thứ tự enum (position nhỏ trước).
  withData.sort((a, b) => a.row.score - b.row.score || a.position - b.position);

  const ranked: RankedSkill[] = withData.map(({ skill, row }) => ({
    skill,
    level: row.level ?? DEFAULT_TARGET_LEVEL,
    reason: RECOMMEND_REASONS.WEAKEST_SKILL,
    focusErrorType: pickFocusErrorType(row.errorStats),
  }));

  for (const skill of noData) {
    // Không có điểm tin cậy: bỏ qua cả mức lẫn thống kê lỗi của dòng hỏng (nếu có).
    ranked.push({
      skill,
      level: DEFAULT_TARGET_LEVEL,
      reason: RECOMMEND_REASONS.NO_DATA_SKILL,
      focusErrorType: null,
    });
  }
  return ranked;
};