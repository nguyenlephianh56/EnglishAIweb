import type { CefrLevel } from "./student";
import type { LibrarySkill } from "./library";

/** 7 dạng bài của backend */
export type ExerciseTypeKey = "multiple_choice" | "fill_blank" | "matching" | "error_correction" | "listening_fill" | "writing" | "speaking";

export type ExerciseStatus = "DRAFT" | "PROPOSED" | "PUBLISHED" | "HIDDEN";

/**
 * Một phần tử của GET /exercises. Giáo viên nhận đủ field (kể cả content/answer);
 * học sinh chỉ nhận id, type, skill, level, topic, content nên status/source... là tùy chọn.
 */
export interface ExerciseListItem {
  id: number;
  type: ExerciseTypeKey | string;
  skill: LibrarySkill;
  level: CefrLevel;
  topic: string;
  status?: ExerciseStatus;
  source?: "ADMIN" | "TEACHER" | "AI";
  inLibrary?: boolean;
  createdAt?: string;
}

export interface ExerciseListResult {
  items: ExerciseListItem[];
  page: number;
  limit: number;
  total: number;
}

export interface ExerciseListParams {
  skill?: LibrarySkill;
  level?: CefrLevel;
  type?: ExerciseTypeKey;
  /** Tìm gần đúng theo chủ đề (không phân biệt hoa/thường) */
  topic?: string;
  page?: number;
  /** Tối đa 50 */
  pageSize?: number;
}
