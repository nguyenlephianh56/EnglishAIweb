import { CircleAlert } from "lucide-react";
import { EXERCISE_REGISTRY, isAnswerableType } from "./registry";
import type { ExerciseTypeDefinition } from "./registry";
import type { ExerciseRendererProps } from "./rendererTypes";
import type { AnswerableExerciseType } from "../../types/exercise";

type ExerciseViewProps<T extends AnswerableExerciseType> = { type: T } & ExerciseRendererProps<T>;

/** Hiện bài tập đúng renderer theo `type` (tra bảng đăng ký, không dùng if/switch). Dạng chưa hỗ trợ thì báo rõ. */
export default function ExerciseView<T extends AnswerableExerciseType>({ type, ...props }: ExerciseViewProps<T>) {
  if (!isAnswerableType(type)) {
    return (
      <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
        <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
        Dạng bài “{String(type)}” chưa được hỗ trợ.
      </div>
    );
  }
  const { Renderer } = EXERCISE_REGISTRY[type] as unknown as ExerciseTypeDefinition<T>;
  return <Renderer {...(props as ExerciseRendererProps<T>)} />;
}
