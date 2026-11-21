// =====================================================================
// learning-paths/learning-paths.select.ts — Chọn bài từ danh sách ứng viên + dựng title (T24).
//
// Hàm THUẦN: không DB. Việc LỌC bài (PUBLISHED + in_library, đúng skill/level, HS chưa làm) do câu truy vấn
// ở bước sau thực hiện bằng SQL; ở đây chỉ nhận các ứng viên đã lọc và quyết định THỨ TỰ + SỐ LƯỢNG.
//
// QUY TẮC:
//  - Mỗi kỹ năng: sắp xếp tất định (created_at tăng dần, rồi id) và lấy tối đa M bài đầu.
//  - Ghép XEN KẼ theo thứ tự kỹ năng đã xếp (vòng 1: bài đầu của từng kỹ năng, vòng 2: bài thứ hai...).
//  - Dừng khi đủ `limit`. Kỹ năng không có ứng viên thì bị bỏ qua.
// =====================================================================
import { MAX_EXERCISES_PER_SKILL, SKILL_LABEL_VI } from "./learning-paths.constants";
import type { RankedSkill } from "./learning-paths.rank";
import type { RecommendReason } from "./learning-paths.constants";

/** Phần tối thiểu của bài mà hàm cần biết (object đầy đủ từ Prisma truyền vào vẫn được). */
export interface CandidateExercise {
  id: number;
  createdAt: Date;
}

export interface SelectedRecommendation<T extends CandidateExercise> {
  exercise: T;
  skill: string;
  level: string;
  reason: RecommendReason;
  focusErrorType: string | null;
}

/** So sánh tất định: created_at tăng dần, hòa thì id tăng dần. */
export const compareCandidates = (a: CandidateExercise, b: CandidateExercise): number =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id;

/**
 * Chọn và xen kẽ bài. `candidatesBySkill` có thể thiếu key (kỹ năng không có bài). Không sửa đầu vào.
 * `limit` <= 0 hoặc không phải số nguyên -> mảng rỗng (nơi gọi đã kiểm `limit` bằng Zod).
 */
export const selectRecommendations = <T extends CandidateExercise>(
  ranked: readonly RankedSkill[],
  candidatesBySkill: ReadonlyMap<string, readonly T[]>,
  limit: number,
  perSkill: number = MAX_EXERCISES_PER_SKILL
): SelectedRecommendation<T>[] => {
  if (!Number.isInteger(limit) || limit <= 0) return [];

  // Mỗi kỹ năng: sắp xếp rồi cắt M bài (một bài chỉ xuất hiện một lần).
  const seen = new Set<number>();
  const queues = ranked.map((entry) => {
    const sorted = [...(candidatesBySkill.get(entry.skill) ?? [])].sort(compareCandidates);
    const picked: T[] = [];
    for (const exercise of sorted) {
      if (picked.length >= perSkill) break;
      if (seen.has(exercise.id)) continue;
      seen.add(exercise.id);
      picked.push(exercise);
    }
    return { entry, picked };
  });

  const result: SelectedRecommendation<T>[] = [];
  for (let round = 0; round < perSkill && result.length < limit; round += 1) {
    for (const { entry, picked } of queues) {
      if (result.length >= limit) break;
      const exercise = picked[round];
      if (exercise === undefined) continue;
      result.push({
        exercise,
        skill: entry.skill,
        level: entry.level,
        reason: entry.reason,
        focusErrorType: entry.focusErrorType,
      });
    }
  }
  return result;
};

/**
 * Title của item lộ trình do SERVER đặt (client không gửi được). Mẫu cố định, không dùng AI:
 *   "Luyện Viết mức A2: tập trung lỗi grammar:tense"   (có loại lỗi)
 *   "Luyện Viết mức A2"                                (không có loại lỗi)
 * `skill` lạ (ngoài 5 giá trị) thì dùng nguyên chuỗi.
 */
export const buildItemTitle = (skill: string, level: string, focusErrorType: string | null): string => {
  const label = (SKILL_LABEL_VI as Record<string, string>)[skill] ?? skill;
  const base = `Luyện ${label} mức ${level}`;
  return focusErrorType === null ? base : `${base}: tập trung lỗi ${focusErrorType}`;
};