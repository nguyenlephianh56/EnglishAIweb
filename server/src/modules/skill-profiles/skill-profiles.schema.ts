// =====================================================================
// skill-profiles/skill-profiles.schema.ts — Zod cho tham số đường dẫn + kiểu response (T15).
//
// Chỉ có schema cho `:studentId`. Không có schema body/query vì hai endpoint T15 chỉ ĐỌC:
//  - GET /skill-profiles/me                  → studentId lấy từ token, không nhận gì từ client.
//  - GET /skill-profiles/students/:studentId → studentId lấy từ đường dẫn, kiểm ở đây.
// =====================================================================
import { z } from "zod";
import type { Skill } from "@prisma/client";
import type { ErrorStats } from "./skill-profiles.errors";

/** Id lớn nhất của cột Int trong PostgreSQL. Lớn hơn thì Prisma ném lỗi tràn số (thành 500), nên chặn sớm ở 400. */
const MAX_INT4 = 2_147_483_647;

/**
 * `:studentId` phải là số nguyên dương, chỉ gồm chữ số (không nhận "1.5", "1e3", "-1", " 7", "abc").
 * Req.params luôn là chuỗi, nên kiểm bằng regex rồi mới đổi sang số.
 */
export const studentIdParamSchema = z.object({
  studentId: z
    .string({ required_error: "Thiếu mã học sinh" })
    .regex(/^\d+$/, "Mã học sinh phải là số nguyên dương")
    .transform((value) => Number(value))
    .refine(
      (value) => Number.isSafeInteger(value) && value >= 1 && value <= MAX_INT4,
      "Mã học sinh không hợp lệ"
    ),
});

export type StudentIdParam = z.infer<typeof studentIdParamSchema>;

/**
 * Thứ tự 5 kỹ năng luôn trả về (câu (a)). FE tự ẩn/hiện FOUNDATION.
 * Kiểu `readonly Skill[]` để thêm giá trị enum mới ở schema.prisma thì chỗ khác báo lỗi biên dịch khi cần.
 */
export const PROFILE_SKILL_ORDER: readonly Skill[] = [
  "LISTENING",
  "SPEAKING",
  "READING",
  "WRITING",
  "FOUNDATION",
];

/** Một điểm trên đường tiến bộ: mốc = submitted_at của attempt đại diện, score = điểm cuối thang 10. */
export interface SkillProgressPoint {
  date: string; // ISO 8601
  score: number;
}

/** Hồ sơ của một kỹ năng. Kỹ năng chưa có dữ liệu: score/level null, error_stats {}, progress []. */
export interface SkillProfileItem {
  skill: Skill;
  score: number | null;
  level: "A1" | "A2" | "B1" | "B2" | null;
  error_stats: ErrorStats;
  progress: SkillProgressPoint[]; // cũ → mới, tối đa PROGRESS_MAX_POINTS
  updated_at: string | null; // ISO 8601, null nếu chưa có dòng skill_profiles
}

/** Dữ liệu `data` của cả hai endpoint. KHÔNG có email, passwordHash, answer hay field nào khác. */
export interface StudentSkillProfileResponse {
  student: { id: number; name: string };
  skills: SkillProfileItem[]; // luôn 5 phần tử theo PROFILE_SKILL_ORDER
}