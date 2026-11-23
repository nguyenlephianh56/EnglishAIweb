import { useAuth } from "../../../hooks/useAuth";

/** Đường dẫn của các trang bài tập dùng chung giữa giáo viên (/teacher/exercises) và quản trị viên (/admin/library). */
export function useExerciseBase() {
  const isAdmin = useAuth().user?.role === "ADMIN";
  const listPath = isAdmin ? "/admin/library" : "/teacher/exercises";
  return {
    isAdmin,
    listPath,
    listLabel: isAdmin ? "Thư viện bài tập" : "Ngân hàng bài tập",
    /** Nơi quay lại sau khi xem/sửa một bài */
    backPath: isAdmin ? "/admin/library" : "/teacher/exercises?tab=draft",
    backLabel: isAdmin ? "Thư viện bài tập" : "Bản nháp",
    newPath: `${listPath}/new`,
    aiPath: `${listPath}/ai`,
    reviewPath: (id: number) => (isAdmin ? `/admin/library/${id}` : `/teacher/exercises/${id}/review`),
  };
}
