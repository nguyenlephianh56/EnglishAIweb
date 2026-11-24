import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listReports, updateReport } from "../../api/reports";
import type { ReportStatus, ReportUpdateStatus } from "../../types/report";

export const REPORTS_KEY = ["admin", "reports"] as const;
export const REPORTS_PAGE_SIZE = 20;

/** Báo lỗi theo trạng thái (undefined = tất cả) và bài tập, phân trang theo con trỏ: "Tải thêm" gọi fetchNextPage. */
export function useReportList(status: ReportStatus | undefined, exerciseId: number | undefined) {
  return useInfiniteQuery({
    queryKey: [...REPORTS_KEY, status ?? "all", exerciseId ?? "all"] as const,
    queryFn: ({ pageParam }) => listReports({ status, exercise_id: exerciseId, limit: REPORTS_PAGE_SIZE, cursor: pageParam }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30 * 1000,
  });
}

/** Chuyển trạng thái một báo lỗi. Sau mỗi lần (kể cả lỗi 409) tải lại các danh sách để khớp máy chủ. */
export function useUpdateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: ReportUpdateStatus }) => updateReport(id, status),
    onSettled: () => queryClient.invalidateQueries({ queryKey: REPORTS_KEY }),
  });
}
