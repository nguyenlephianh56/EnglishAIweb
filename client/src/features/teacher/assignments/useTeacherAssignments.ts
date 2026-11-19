import { useQuery } from "@tanstack/react-query";
import { getAssignmentSubmissions, listTeacherAssignments } from "../../../api/assignments";
import type { TeacherAssignmentItem } from "../../../types/assignments";

export const TEACHER_ASSIGNMENTS_KEY = ["teacher", "assignments"] as const;

const PAGE_LIMIT = 50; // tối đa backend cho phép
const MAX_PAGES = 20; // chặn vòng lặp: tối đa 1.000 bài giao

/**
 * Tải TẤT CẢ bài giao của giáo viên (có thể lọc theo lớp) bằng cách gọi lần lượt các trang limit=50.
 * Lý do: backend chưa lọc theo trạng thái (đang diễn ra / đã kết thúc) cho giáo viên và cũng chưa có
 * số liệu tổng hợp, nên thanh thống kê, tab và phân trang đều tính phía client trên dữ liệu thật này.
 * TODO: khi backend có GET /assignments?phase=&counts, thay hook này bằng truy vấn phân trang thật.
 */
async function fetchAllAssignments(classId?: number) {
  const items: TeacherAssignmentItem[] = [];
  let page = 1;
  let total = 0;
  do {
    const res = await listTeacherAssignments({ classId, page, limit: PAGE_LIMIT });
    items.push(...res.items);
    total = res.total;
    if (res.items.length === 0) break;
    page += 1;
  } while (items.length < total && page <= MAX_PAGES);
  return { items, total, truncated: items.length < total };
}

export function useAllTeacherAssignments(classId?: number) {
  return useQuery({
    queryKey: [...TEACHER_ASSIGNMENTS_KEY, "all", classId ?? "all"] as const,
    queryFn: () => fetchAllAssignments(classId),
    staleTime: 30 * 1000,
  });
}

/** Bài nộp của cả lớp cho một bài giao. Tắt khi id không hợp lệ. */
export function useAssignmentSubmissions(assignmentId: number) {
  return useQuery({
    queryKey: [...TEACHER_ASSIGNMENTS_KEY, "submissions", assignmentId] as const,
    queryFn: () => getAssignmentSubmissions(assignmentId),
    enabled: Number.isInteger(assignmentId) && assignmentId > 0,
    staleTime: 15 * 1000,
    retry: false,
  });
}
