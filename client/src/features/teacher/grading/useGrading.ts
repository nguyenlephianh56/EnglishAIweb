import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAttemptReview, saveTeacherGrade } from "../../../api/attempts";
import { TEACHER_ASSIGNMENTS_KEY } from "../assignments/useTeacherAssignments";
import type { AttemptReview, TeacherGradeBody } from "../../../types/attemptReview";

export const GRADING_KEY = ["teacher", "grading"] as const;
export const reviewKey = (id: number) => [...GRADING_KEY, "review", id] as const;

/** Bài nộp cần chấm (GET /attempts/:id/review). Tắt khi id không hợp lệ; 404 không thử lại. */
export const useAttemptReview = (id: number) =>
  useQuery({
    queryKey: reviewKey(id),
    queryFn: () => getAttemptReview(id),
    enabled: Number.isInteger(id) && id > 0,
    staleTime: 30 * 1000,
    retry: false,
  });

/** Lưu điểm/nhận xét (PATCH /attempts/:id/grade): cập nhật bài đang xem ngay và làm mới danh sách bài nộp của lớp */
export function useSaveTeacherGrade(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TeacherGradeBody) => saveTeacherGrade(id, body),
    onSuccess: (res) => {
      queryClient.setQueryData<AttemptReview>(reviewKey(id), (old) =>
        old ? { ...old, score: res.score, teacher_score: res.teacher_score, teacher_comment: res.teacher_comment, final_score: res.final_score, max_score: res.max_score } : old,
      );
      void queryClient.invalidateQueries({ queryKey: [...TEACHER_ASSIGNMENTS_KEY, "submissions"] });
    },
  });
}
