import type { CefrLevel, SkillKey } from "./student";

/** Bốn kỹ năng + nhóm "Nền tảng" (ngữ pháp, từ vựng) */
export type LibrarySkill = SkillKey | "FOUNDATION";
export type ExerciseType = "MULTIPLE_CHOICE" | "AI_GRADED";
export type LibrarySort = "newest" | "level";

/** Bài luyện tập dạng tóm tắt, dùng cho thẻ trong thư viện */
export interface ExerciseSummary {
  id: number;
  title: string;
  description: string;
  skill: LibrarySkill;
  level: CefrLevel;
  type: ExerciseType;
  durationMin: number;
  /** Bài trắc nghiệm có số câu; bài AI chấm thì không có */
  questionCount?: number;
  aiGraded: boolean;
  topic: string;
  createdAt: string;
}

export interface LibraryFilters {
  skill?: LibrarySkill;
  level?: CefrLevel;
  type?: ExerciseType;
  topic?: string;
  q: string;
  sort: LibrarySort;
  page: number;
}

export interface LibraryResult {
  items: ExerciseSummary[];
  total: number;
  /** Trang thực tế sau khi giới hạn trong [1, pageCount] */
  page: number;
  pageCount: number;
  pageSize: number;
}
