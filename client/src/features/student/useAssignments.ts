import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { listAssignments } from "../../api/assignments";
import type { AssignmentStatus } from "../../types/assignment";
import type { AssignmentFilters } from "./assignmentFilters";

export const ASSIGNMENTS_KEY = ["student", "assignments"] as const;
export const ASSIGNMENTS_PAGE_SIZE = 20;
const STALE = 30 * 1000;

/** Danh sách bài được giao theo bộ lọc (GET /assignments), luôn theo hạn nộp gần nhất. */
export function useAssignmentList(filters: AssignmentFilters) {
  return useQuery({
    queryKey: [...ASSIGNMENTS_KEY, "list", filters] as const,
    queryFn: () => listAssignments({ status: filters.status, classId: filters.classId, page: filters.page, limit: ASSIGNMENTS_PAGE_SIZE }),
    placeholderData: keepPreviousData, // đổi tab/trang thì giữ danh sách cũ tới khi có kết quả mới
    staleTime: STALE,
  });
}

const COUNT_STATUSES: (AssignmentStatus | undefined)[] = [undefined, "NOT_STARTED", "SUBMITTED", "OVERDUE"];

/** Số đếm cho các tab: mỗi trạng thái một truy vấn limit=1 chỉ để lấy `total` (có tính theo lớp đang lọc). */
export function useAssignmentCounts(classId?: number) {
  const results = useQueries({
    queries: COUNT_STATUSES.map((status) => ({
      queryKey: [...ASSIGNMENTS_KEY, "count", status ?? "all", classId ?? "all"] as const,
      queryFn: async () => (await listAssignments({ status, classId, page: 1, limit: 1 })).total,
      staleTime: STALE,
    })),
  });
  return {
    counts: { all: results[0].data, NOT_STARTED: results[1].data, SUBMITTED: results[2].data, OVERDUE: results[3].data } as Record<"all" | AssignmentStatus, number | undefined>,
    isError: results.some((r) => r.isError),
    refetch: () => Promise.all(results.map((r) => r.refetch())),
  };
}
