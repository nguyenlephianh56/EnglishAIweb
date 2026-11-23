import type { LibrarySkill } from "./library";
import type { CefrLevel } from "./student";

export type RecommendationReason = "weakest_skill" | "no_data_skill";

/** Một phần tử của GET /recommendations/me */
export interface RecommendationItem {
  exercise: { id: number; type: string; skill: LibrarySkill; level: CefrLevel; topic: string };
  reason: RecommendationReason;
  /** Loại lỗi học sinh hay mắc (ví dụ "grammar:tense"), null nếu chưa có */
  focus_error_type: string | null;
}
