import type { AnswerableExerciseType, ExerciseContentMap, ExerciseValueMap } from "../../types/exercise";

export type RendererMode = "answering" | "review";

/** Dữ liệu chấm, chỉ dùng ở chế độ "review" */
export interface RendererResult<V> {
  /** Đáp án đúng, cùng dạng với value */
  correctAnswer?: V;
  explanation?: string | null;
}

/** Props chung của mọi renderer dạng bài */
export interface ExerciseRendererProps<T extends AnswerableExerciseType> {
  content: ExerciseContentMap[T];
  value: ExerciseValueMap[T];
  onChange: (value: ExerciseValueMap[T]) => void;
  mode: RendererMode;
  /** Khóa nhập (đang gửi bài...). Ở chế độ review luôn khóa. */
  disabled?: boolean;
  result?: RendererResult<ExerciseValueMap[T]>;
}
