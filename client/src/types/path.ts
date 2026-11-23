import type { LibrarySkill } from "./library";
import type { CefrLevel } from "./student";

export interface PathExercise {
  id: number;
  type: string;
  skill: LibrarySkill;
  level: CefrLevel;
  topic: string;
}

export interface PathItem {
  id: number;
  title: string;
  /** Học sinh tự bấm đánh dấu, hệ thống không tự hoàn thành khi làm bài */
  done: boolean;
  /** null = bài không còn khả dụng (bị ẩn/xóa) */
  exercise: PathExercise | null;
}

/** Lộ trình tuần của học sinh (GET /learning-path/me) */
export interface LearningPathView {
  id: number;
  /** Thứ Hai của tuần, dạng YYYY-MM-DD */
  week_start: string;
  created_at: string;
  items: PathItem[];
  progress: { done: number; total: number };
}
