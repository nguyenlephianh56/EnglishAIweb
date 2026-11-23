import type { QueryClient } from "@tanstack/react-query";
import { EXERCISE_COUNT_KEY } from "../../admin/useAdminData";
import { TEACHER_EXERCISES_KEY } from "./useTeacherExercises";

/** Danh sách bài tập của quản trị viên (thư viện, đề xuất chờ duyệt) */
export const ADMIN_EXERCISES_KEY = ["admin", "exercises"] as const;

/**
 * Làm mới mọi nơi đang giữ danh sách/số đếm bài tập sau khi một bài đổi (tạo, sửa, duyệt, từ chối, ẩn):
 * đề xuất + thư viện của admin, số đếm theo trạng thái, ngân hàng bài của giáo viên (gồm từng bài) và bộ chọn bài ở trang Giao bài.
 */
export function refreshExerciseCaches(queryClient: QueryClient) {
  for (const queryKey of [ADMIN_EXERCISES_KEY, EXERCISE_COUNT_KEY, TEACHER_EXERCISES_KEY, ["teacher", "exercise-picker"]]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
