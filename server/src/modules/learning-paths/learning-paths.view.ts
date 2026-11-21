// =====================================================================
// learning-paths/learning-paths.view.ts — Hình dạng dữ liệu trả cho HỌC SINH (T24).
//
// Cách làm giống `toStudentView` của module exercises: DANH SÁCH TRẮNG. Hàm tự tay chọn từng field được
// phép trả, nên sau này bảng `exercises` có thêm cột mới thì cột đó cũng KHÔNG tự lọt ra ngoài.
//
// Bài trong gợi ý/lộ trình chỉ có {id, type, skill, level, topic}. KHÔNG BAO GIỜ có `content`, `answer`,
// `explanation`: HS mở bài qua API thư viện hiện có (API đó mới che đáp án theo 4c mục 4-5).
// =====================================================================
import type { RecommendReason } from "./learning-paths.constants";
import type { CandidateExercise, SelectedRecommendation } from "./learning-paths.select";

export interface ExerciseForSummary {
  id: number;
  type: string;
  skill: string;
  level: string;
  topic: string;
}

export interface ExerciseSummary {
  id: number;
  type: string;
  skill: string;
  level: string;
  topic: string;
}

/** Một phần tử của "Gợi ý cho bạn". */
export interface RecommendationItem {
  exercise: ExerciseSummary;
  reason: RecommendReason;
  focus_error_type: string | null;
}

/** Chọn đúng 5 field cho phép; object đầy đủ từ Prisma truyền vào vẫn được (field thừa bị bỏ). */
export const toExerciseSummary = (exercise: ExerciseForSummary): ExerciseSummary => ({
  id: exercise.id,
  type: exercise.type,
  skill: exercise.skill,
  level: exercise.level,
  topic: exercise.topic,
});

export const toRecommendationItem = (
  selected: SelectedRecommendation<CandidateExercise & ExerciseForSummary>
): RecommendationItem => ({
  exercise: toExerciseSummary(selected.exercise),
  reason: selected.reason,
  focus_error_type: selected.focusErrorType,
});