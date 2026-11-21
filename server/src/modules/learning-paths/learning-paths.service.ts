// =====================================================================
// learning-paths/learning-paths.service.ts — Truy vấn DB cho gợi ý bài (T24, bản KHÔNG AI).
//
// MỘT hàm lõi `recommendExercises(studentId, limit)` dùng chung cho cả "Gợi ý cho bạn" và (bước sau) tạo lộ
// trình tuần. Chỉ ĐỌC: không ghi DB, không gọi AI, không sửa `skill_profiles`.
//
// Cách làm (Project.md 4c mục 11):
//  1. Đọc hồ sơ kỹ năng của HS bằng `readSavedSkillProfiles` của T15 (tái dùng, không viết lại).
//  2. `rankSkills` (hàm thuần) xếp 5 kỹ năng: yếu nhất trước, chưa có dữ liệu xếp sau.
//  3. Mỗi kỹ năng đúng MỘT truy vấn bài (tối đa 5 truy vấn, không lặp từng bài -> không N+1), chạy song song:
//       status = PUBLISHED AND in_library = true, đúng skill + đúng mức mục tiêu,
//       HS CHƯA có attempt nào của bài đó (cả bài giao lẫn tự luyện),
//       sắp xếp tất định created_at tăng dần rồi id, lấy tối đa M bài.
//  4. `selectRecommendations` (hàm thuần) xen kẽ theo thứ tự kỹ năng và cắt theo `limit`.
//
// Truy vấn chỉ `select` 5 field hiển thị + createdAt (để sắp xếp): `content`, `answer`, `explanation`
// không bao giờ được đọc vào bộ nhớ của hàm này.
// =====================================================================
import type { Prisma, Skill } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { readSavedSkillProfiles } from "../skill-profiles/skill-profiles.service";
import { MAX_EXERCISES_PER_SKILL } from "./learning-paths.constants";
import { rankSkills } from "./learning-paths.rank";
import { selectRecommendations, type SelectedRecommendation } from "./learning-paths.select";
import { toRecommendationItem, type ExerciseForSummary, type RecommendationItem } from "./learning-paths.view";

/** Thư viện chung (Project.md 4b): PUBLISHED và in_library = true. (Dùng chuỗi trực tiếp để file này không cần enum runtime.) */
export const LIBRARY_WHERE = {
  status: "PUBLISHED",
  inLibrary: true,
} as const satisfies Prisma.ExerciseWhereInput;

/** Chỉ các field này được đọc từ bảng exercises. */
const CANDIDATE_SELECT = {
  id: true,
  type: true,
  skill: true,
  level: true,
  topic: true,
  createdAt: true,
} as const satisfies Prisma.ExerciseSelect;

export type CandidateRow = ExerciseForSummary & { createdAt: Date };

/**
 * Gợi ý tối đa `limit` bài cho HS. Trả mảng rỗng khi `limit` không hợp lệ hoặc không có bài phù hợp.
 * `studentId` luôn do nơi gọi lấy từ token (controller), không bao giờ từ client.
 */
export const recommendExercises = async (
  studentId: number,
  limit: number
): Promise<SelectedRecommendation<CandidateRow>[]> => {
  if (!Number.isInteger(limit) || limit <= 0) return [];

  const profiles = await readSavedSkillProfiles(studentId);
  const ranked = rankSkills(
    profiles.map((row) => ({
      skill: row.skill,
      score: row.score,
      level: row.level,
      errorStats: row.errorStats,
    }))
  );

  // Đúng 1 truy vấn cho mỗi kỹ năng (tối đa 5), chạy song song.
  const found = await Promise.all(
    ranked.map((entry) =>
      prisma.exercise.findMany({
        where: {
          skill: entry.skill as Skill,
          level: entry.level,
          ...LIBRARY_WHERE,
          attempts: { none: { studentId } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: MAX_EXERCISES_PER_SKILL,
        select: CANDIDATE_SELECT,
      })
    )
  );

  const candidatesBySkill = new Map<string, CandidateRow[]>(ranked.map((entry, index) => [entry.skill, found[index]]));
  return selectRecommendations(ranked, candidatesBySkill, limit);
};

/** Dữ liệu cho `GET /recommendations/me`: đã chọn field an toàn, đặt tên field theo hợp đồng API. */
export const getMyRecommendations = async (studentId: number, limit: number): Promise<RecommendationItem[]> => {
  const selected = await recommendExercises(studentId, limit);
  return selected.map(toRecommendationItem);
};