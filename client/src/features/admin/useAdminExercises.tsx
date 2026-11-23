import { useMemo } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { approveExercise, deleteExercise, listExercises, rejectExercise } from "../../api/exercises";
import { ADMIN_EXERCISES_KEY, refreshExerciseCaches } from "../teacher/exercises/exerciseCache";
import { EXERCISE_COUNT_KEY, useAdminUsers } from "./useAdminData";
import type { ExerciseListParams } from "../../types/exercise";

export const ADMIN_EXERCISES_PAGE_SIZE = 10;

/** Một trang bài tập (GET /exercises, quản trị viên thấy mọi trạng thái). Giữ dữ liệu cũ trong lúc chuyển trang/lọc. */
export function useAdminExerciseList(params: Omit<ExerciseListParams, "pageSize">) {
  const query = { ...params, pageSize: ADMIN_EXERCISES_PAGE_SIZE };
  return useQuery({
    queryKey: [...ADMIN_EXERCISES_KEY, "list", query] as const,
    queryFn: () => listExercises(query),
    placeholderData: keepPreviousData,
  });
}

/** Số bài đang chờ duyệt (total của status=PROPOSED); cùng khóa với thẻ đếm ở trang Tổng quan nên dùng chung cache. */
export const usePendingProposalCount = () =>
  useQuery({
    queryKey: [...EXERCISE_COUNT_KEY, "PROPOSED"] as const,
    queryFn: async () => (await listExercises({ status: "PROPOSED", pageSize: 1 })).total,
    staleTime: 30 * 1000,
  });

/** id người tạo -> tên (items của /exercises chỉ có createdById) */
export function useCreatorNames() {
  const users = useAdminUsers();
  return useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.name] as const)), [users.data]);
}

/**
 * Duyệt / từ chối / ẩn bài. Làm mới cache sau mỗi lần, kể cả khi lỗi (409: bài không còn chờ duyệt),
 * để danh sách phản ánh đúng trạng thái trên máy chủ.
 */
export function useExerciseDecisions() {
  const queryClient = useQueryClient();
  const onSettled = () => refreshExerciseCaches(queryClient);
  const approve = useMutation({ mutationFn: (id: number) => approveExercise(id), onSettled });
  const reject = useMutation({ mutationFn: ({ id, reason }: { id: number; reason?: string }) => rejectExercise(id, reason), onSettled });
  const hide = useMutation({ mutationFn: (id: number) => deleteExercise(id), onSettled });
  return { approve, reject, hide };
}
