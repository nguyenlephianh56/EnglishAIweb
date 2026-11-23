import type { CefrLevel } from "./student";
import type { LibrarySkill } from "./library";

/** Một mốc điểm trong lịch sử tiến bộ của một kỹ năng (điểm 0..10) */
export interface ApiProgressPoint {
  /** ISO 8601 */
  date: string;
  score: number;
}

export interface ApiSkillEntry {
  skill: LibrarySkill;
  /** 0..10, null nếu chưa có dữ liệu */
  score: number | null;
  level: CefrLevel | null;
  /** Số lỗi theo loại, ví dụ { "grammar:tense": 3 } */
  error_stats: Record<string, number>;
  /** Cũ nhất → mới nhất */
  progress: ApiProgressPoint[];
  updated_at: string | null;
}

/** Dữ liệu của GET /skill-profiles/me và GET /skill-profiles/students/:id */
export interface SkillProfileResponse {
  student: { id: number; name: string };
  /** 5 kỹ năng theo thứ tự LISTENING, SPEAKING, READING, WRITING, FOUNDATION */
  skills: ApiSkillEntry[];
}
