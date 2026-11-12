import type { AssignmentStatus } from "../../types/assignment";

export interface AssignmentFilters {
  status?: AssignmentStatus;
  classId?: number;
  page: number;
}

const STATUSES: AssignmentStatus[] = ["NOT_STARTED", "SUBMITTED", "OVERDUE"];

/** Đọc bộ lọc từ URL (?status=&classId=&page=), bỏ qua giá trị không hợp lệ. */
export function parseAssignmentFilters(params: URLSearchParams): AssignmentFilters {
  const status = STATUSES.find((s) => s === params.get("status"));
  const classId = Number.parseInt(params.get("classId") ?? "", 10);
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  return {
    status,
    classId: Number.isFinite(classId) && classId > 0 ? classId : undefined,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}
