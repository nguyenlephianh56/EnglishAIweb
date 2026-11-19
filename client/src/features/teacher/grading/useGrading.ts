import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchGradingList, fetchGradingSubmission, saveGradingScores } from "../mock/gradingData";
import type { SaveGradePayload } from "../../../types/grading";

// TODO(backend): các hook dưới đây đang đọc dữ liệu giả (features/teacher/mock/gradingData.ts) vì backend CHƯA có API
// cho giáo viên đọc bài làm và sửa điểm. Khi có API, chỉ cần đổi hàm fetch/save, giữ nguyên khóa cache và kiểu dữ liệu.

export const GRADING_KEY = ["teacher", "grading"] as const;

export const useGradingList = () => useQuery({ queryKey: [...GRADING_KEY, "list"] as const, queryFn: fetchGradingList, staleTime: 30 * 1000 });

export const useGradingSubmission = (id: number) =>
  useQuery({ queryKey: [...GRADING_KEY, "detail", id] as const, queryFn: () => fetchGradingSubmission(id), enabled: Number.isFinite(id), retry: false });

export function useSaveGrading(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveGradePayload) => saveGradingScores(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData([...GRADING_KEY, "detail", id], updated);
      void queryClient.invalidateQueries({ queryKey: [...GRADING_KEY, "list"] });
    },
  });
}
