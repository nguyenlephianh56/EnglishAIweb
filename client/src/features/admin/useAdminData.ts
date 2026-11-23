import { useEffect, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { approveTeacher, listUsers, lockUser, unlockUser } from "../../api/admin";
import { listExercises } from "../../api/exercises";
import { getErrorMessage } from "../../api/client";
import type { AdminUser } from "../../types/admin";
import type { ExerciseStatus } from "../../types/exercise";

export const ADMIN_USERS_KEY = ["admin", "users"] as const;
export const PENDING_TEACHERS_KEY = ["admin", "users", "pending-teachers"] as const;
export const EXERCISE_COUNT_KEY = ["admin", "exercise-count"] as const;

const STALE = 30 * 1000;

/** Toàn bộ tài khoản (GET /admin/users) */
export const useAdminUsers = () => useQuery({ queryKey: ADMIN_USERS_KEY, queryFn: () => listUsers(), staleTime: STALE });

/** Giáo viên chờ duyệt (GET /admin/users?role=TEACHER&status=PENDING), mới nhất trước */
export const usePendingTeachers = () =>
  useQuery({
    queryKey: PENDING_TEACHERS_KEY,
    queryFn: () => listUsers({ role: "TEACHER", status: "PENDING" }),
    staleTime: STALE,
  });

export const EXERCISE_STATUSES: ExerciseStatus[] = ["DRAFT", "PROPOSED", "PUBLISHED", "HIDDEN"];

/**
 * Số bài tập theo từng trạng thái: 4 truy vấn song song GET /exercises?status=X&pageSize=1, chỉ đọc `total` của phân trang.
 * `counts[status]` là undefined khi truy vấn đó chưa xong hoặc lỗi.
 */
export function useExerciseStatusCounts() {
  const results = useQueries({
    queries: EXERCISE_STATUSES.map((status) => ({
      queryKey: [...EXERCISE_COUNT_KEY, status] as const,
      queryFn: async () => (await listExercises({ status, pageSize: 1 })).total,
      staleTime: STALE,
    })),
  });
  const counts = Object.fromEntries(EXERCISE_STATUSES.map((s, i) => [s, results[i].data])) as Record<ExerciseStatus, number | undefined>;
  return {
    counts,
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
    refetch: () => Promise.all(results.map((r) => r.refetch())),
  };
}

export type UserAction = "approve" | "lock" | "unlock";

const DONE: Record<UserAction, (name: string) => string> = {
  approve: (n) => `Đã duyệt giáo viên ${n}.`,
  lock: (n) => `Đã khóa tài khoản ${n}.`,
  unlock: (n) => `Đã mở khóa tài khoản ${n}.`,
};

/**
 * Duyệt / khóa / mở khóa tài khoản. Sau mỗi lần (kể cả lỗi 409 vì trạng thái đã đổi) làm mới danh sách tài khoản
 * và danh sách giáo viên chờ duyệt. `notice` là thông báo kết quả, thành công tự ẩn sau vài giây.
 */
export function useUserActions() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const mutation = useMutation({
    mutationFn: ({ action, user }: { action: UserAction; user: AdminUser }) => (action === "approve" ? approveTeacher(user.id) : action === "lock" ? lockUser(user.id) : unlockUser(user.id)),
    onMutate: () => setNotice(null),
    onSuccess: (_data, { action, user }) => setNotice({ type: "success", text: DONE[action](user.name) }),
    onError: (err) => setNotice({ type: "error", text: getErrorMessage(err, "Không thực hiện được thao tác, vui lòng thử lại.") }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
      void queryClient.invalidateQueries({ queryKey: PENDING_TEACHERS_KEY });
    },
  });

  useEffect(() => {
    if (notice?.type !== "success") return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  return {
    run: (action: UserAction, user: AdminUser) => mutation.mutate({ action, user }),
    /** id tài khoản đang được xử lý (khóa các nút khác), null khi rảnh */
    busyId: mutation.isPending ? (mutation.variables?.user.id ?? null) : null,
    pending: mutation.isPending,
    notice,
    clearNotice: () => setNotice(null),
  };
}
