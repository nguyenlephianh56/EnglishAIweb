import type { CefrLevel, SkillKey } from "./student";
import type { ExerciseTypeKey } from "./exercise";

/** Bốn kỹ năng + nhóm "Nền tảng" (ngữ pháp, từ vựng) */
export type LibrarySkill = SkillKey | "FOUNDATION";
export type { ExerciseTypeKey } from "./exercise";

/** Bài luyện tập dạng tóm tắt, dùng cho thẻ trong thư viện (dữ liệu thật từ GET /exercises) */
export interface ExerciseSummary {
  id: number;
  /** Tiêu đề thẻ = chủ đề của bài */
  topic: string;
  skill: LibrarySkill;
  level: CefrLevel;
  type: string;
  /** Số câu/chỗ trống/cặp, hoặc "AI chấm"; null nếu không tính được */
  questionCount: number | "AI chấm" | null;
}

export interface LibraryFilters {
  skill?: LibrarySkill;
  level?: CefrLevel;
  type?: ExerciseTypeKey;
  topic?: string;
  q: string;
  page: number;
}

export interface LibraryResult {
  items: ExerciseSummary[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}
