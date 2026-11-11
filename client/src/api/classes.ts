import { api, unwrap } from "./client";
import type { JoinedClass, StudentClassItem } from "../types/student";
import type { ClassSummary } from "../types/teacher";

/** Học sinh tham gia lớp bằng mã 6 ký tự. Backend tự chuẩn hóa chữ HOA. */
export const joinClass = (code: string) => unwrap<JoinedClass>(api.post("/classes/join", { code }));

/** Giáo viên: danh sách lớp của mình (kèm mã lớp và studentCount). */
export const listClasses = () => unwrap<ClassSummary[]>(api.get("/classes"));

/**
 * Học sinh: lớp đã tham gia (cùng endpoint GET /classes nhưng dữ liệu trả về khác giáo viên:
 * không có mã lớp, hiện chưa có studentCount).
 */
export const listJoinedClasses = () => unwrap<StudentClassItem[]>(api.get("/classes"));
