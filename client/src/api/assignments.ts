import { api, unwrap } from "./client";
import type {
  AssignmentListParams,
  AssignmentListResult,
  AssignmentSubmissions,
  CreateAssignmentBody,
  CreatedAssignment,
  TeacherAssignmentListParams,
  TeacherAssignmentListResult,
} from "../types/assignments";

/**
 * GET /assignments?status=&classId=&page=&limit=
 * Học sinh: bài được giao, luôn theo hạn nộp gần nhất (backend không hỗ trợ sắp xếp khác).
 * limit mặc định 20, tối đa 50. Tham số undefined sẽ không được gửi đi.
 */
export const listAssignments = (params: AssignmentListParams = {}) => unwrap<AssignmentListResult>(api.get("/assignments", { params }));

/**
 * GET /assignments?classId=&page=&limit= khi đăng nhập là GIÁO VIÊN: bài đã giao ở các lớp của mình,
 * hạn nộp xa nhất lên đầu. Backend CHƯA lọc theo trạng thái (đang diễn ra / đã kết thúc) cho giáo viên.
 * limit mặc định 20, tối đa 50.
 */
export const listTeacherAssignments = (params: TeacherAssignmentListParams = {}) =>
  unwrap<TeacherAssignmentListResult>(api.get("/assignments", { params }));

/** Giáo viên: bài nộp của cả lớp cho một bài giao (mọi học sinh trong lớp, kể cả chưa làm). */
export const getAssignmentSubmissions = (assignmentId: number) => unwrap<AssignmentSubmissions>(api.get(`/assignments/${assignmentId}/submissions`));

/** Giáo viên giao bài cho một lớp. Lỗi (hạn nộp quá khứ, dạng bài chưa hỗ trợ...) nằm trong message của server. */
export const createAssignment = (body: CreateAssignmentBody) => unwrap<CreatedAssignment>(api.post("/assignments", body));