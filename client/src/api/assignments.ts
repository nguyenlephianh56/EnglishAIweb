import { api, unwrap } from "./client";
import type { AssignmentListParams, AssignmentListResult } from "../types/assignments";

/**
 * GET /assignments?status=&classId=&page=&limit=
 * Học sinh: bài được giao, luôn theo hạn nộp gần nhất (backend không hỗ trợ sắp xếp khác).
 * limit mặc định 20, tối đa 50. Tham số undefined sẽ không được gửi đi.
 */
export const listAssignments = (params: AssignmentListParams = {}) => unwrap<AssignmentListResult>(api.get("/assignments", { params }));
