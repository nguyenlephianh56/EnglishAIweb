import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { approveExercise, deleteExercise, getExercise, proposeExercise, publishExercise, rejectExercise, updateExercise } from "../../../api/exercises";
import { refreshExerciseCaches } from "./exerciseCache";
import { TEACHER_EXERCISES_KEY } from "./useTeacherExercises";
import type { UpdateExercisePayload } from "../../../types/exercise";

/** Một bài (GET /exercises/:id), nằm dưới TEACHER_EXERCISES_KEY nên làm mới danh sách cũng làm mới bài này */
export const exerciseDetailKey = (id: number) => [...TEACHER_EXERCISES_KEY, "detail", id] as const;

export const useExerciseDetail = (id: number) =>
  useQuery({ queryKey: exerciseDetailKey(id), queryFn: () => getExercise(id), enabled: Number.isInteger(id) && id > 0, retry: false });

/** Lưu / gửi duyệt / xóa (với admin: ẩn) / duyệt / từ chối một bài; mỗi thao tác xong thì làm mới danh sách bài tập, bài đang xem và bộ chọn bài ở trang Giao bài. */
export function useExerciseMutations(id: number) {
  const queryClient = useQueryClient();
  const refresh = () => refreshExerciseCaches(queryClient);

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
  // Chỉ quản trị viên: duyệt / từ chối bài đang chờ duyệt (409 nếu bài không còn ở trạng thái đó)
  const approve = useMutation({ mutationFn: () => approveExercise(id), onSettled: refresh });
  const reject = useMutation({ mutationFn: (reason?: string) => rejectExercise(id, reason), onSettled: refresh });
  const publish = useMutation({ mutationFn: () => publishExercise(id), onSettled: refresh });
  return { update, propose, remove, approve, reject, publish };
}