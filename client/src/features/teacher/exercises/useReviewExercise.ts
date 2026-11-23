import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteExercise, getExercise, proposeExercise, updateExercise } from "../../../api/exercises";
import { TEACHER_EXERCISES_KEY } from "./useTeacherExercises";
import type { UpdateExercisePayload } from "../../../types/exercise";

/** Một bài (GET /exercises/:id), nằm dưới TEACHER_EXERCISES_KEY nên làm mới danh sách cũng làm mới bài này */
export const exerciseDetailKey = (id: number) => [...TEACHER_EXERCISES_KEY, "detail", id] as const;

export const useExerciseDetail = (id: number) =>
  useQuery({ queryKey: exerciseDetailKey(id), queryFn: () => getExercise(id), enabled: Number.isInteger(id) && id > 0, retry: false });

/** Lưu / gửi duyệt / xóa một bài; mỗi thao tác xong thì làm mới danh sách bài tập, bài đang xem và bộ chọn bài ở trang Giao bài. */
export function useExerciseMutations(id: number) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: TEACHER_EXERCISES_KEY });
    void queryClient.invalidateQueries({ queryKey: ["teacher", "exercise-picker"] });
  };

  const update = useMutation({
    mutationFn: (body: UpdateExercisePayload) => updateExercise(id, body),
    onSuccess: (saved) => {
      queryClient.setQueryData(exerciseDetailKey(id), saved);
      refresh();
    },
  });
  const propose = useMutation({ mutationFn: () => proposeExercise(id), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: () => deleteExercise(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: exerciseDetailKey(id) });
      refresh();
    },
  });
  return { update, propose, remove };
}
