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

// ---------------------------------------------------------------------------
// Lộ trình tuần (T24, Bước 3)
// ---------------------------------------------------------------------------

/** Bài kèm trạng thái, đọc cùng lúc với item (1 truy vấn include, không N+1). */
export interface PathExerciseRow extends ExerciseForSummary {
  status: string;
  inLibrary: boolean;
}

export interface PathItemRow {
  id: number;
  title: string;
  done: boolean;
  exercise: PathExerciseRow | null;
}

export interface PathRow {
  id: number;
  weekStart: Date;
  createdAt: Date;
  items: PathItemRow[];
}

export interface LearningPathItemView {
  id: number;
  title: string;
  done: boolean;
  /** null khi bài đã bị xóa (exercise_id NULL) hoặc không còn PUBLISHED + in_library. */
  exercise: ExerciseSummary | null;
}

export interface LearningPathView {
  id: number;
  /** "YYYY-MM-DD" (thứ Hai của tuần). */
  week_start: string;
  /** ISO 8601. */
  created_at: string;
  items: LearningPathItemView[];
  progress: { done: number; total: number };
}

/** Bài còn mở được cho HS khi và chỉ khi đang PUBLISHED và nằm trong thư viện. */
const isOpenable = (exercise: PathExerciseRow): boolean => exercise.status === "PUBLISHED" && exercise.inLibrary === true;

/** Danh sách trắng: chỉ trả các field dưới đây, không có field thừa. */
export const toLearningPathView = (path: PathRow): LearningPathView => {
  const items = path.items.map((item) => ({
    id: item.id,
    title: item.title,
    done: item.done,
    exercise: item.exercise !== null && isOpenable(item.exercise) ? toExerciseSummary(item.exercise) : null,
  }));
  return {
    id: path.id,
    week_start: path.weekStart.toISOString().slice(0, 10),
    created_at: path.createdAt.toISOString(),
    items,
    progress: { done: items.filter((item) => item.done).length, total: items.length },
  };
};