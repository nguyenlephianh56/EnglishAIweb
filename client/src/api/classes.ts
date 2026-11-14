import { api, unwrap } from "./client";
import type { JoinedClass, StudentClassItem } from "../types/student";
import type { ClassDetail, ClassStudent, ClassSummary } from "../types/teacher";

/** Học sinh tham gia lớp bằng mã 6 ký tự. Backend tự chuẩn hóa chữ HOA. */
export const joinClass = (code: string) => unwrap<JoinedClass>(api.post("/classes/join", { code }));

/** Giáo viên: danh sách lớp của mình (kèm mã lớp và studentCount). */
export const listClasses = () => unwrap<ClassSummary[]>(api.get("/classes"));

/**
 * Học sinh: lớp đã tham gia (cùng endpoint GET /classes nhưng dữ liệu trả về khác giáo viên:
 * không có mã lớp, hiện chưa có studentCount).
 */
export const listJoinedClasses = () => unwrap<StudentClassItem[]>(api.get("/classes"));

/** Giáo viên tạo lớp: chỉ gửi tên (1-100 ký tự), mã lớp do server sinh. Trả về lớp mới (có `code`). */
export const createClass = (name: string) => unwrap<ClassSummary>(api.post("/classes", { name }));

/** Giáo viên: chi tiết một lớp kèm danh sách học sinh. Lớp không tồn tại hoặc của người khác -> 404. */
export const getClass = (id: number) => unwrap<ClassDetail>(api.get(`/classes/${id}`));

/** Giáo viên thêm học sinh bằng email. Lỗi (không có email, đã trong lớp...) nằm trong message của server. */
export const addStudentToClass = (classId: number, email: string) => unwrap<ClassStudent>(api.post(`/classes/${classId}/students`, { email }));

/** Giáo viên xóa học sinh khỏi lớp. */
export const removeStudentFromClass = (classId: number, studentId: number) => unwrap<{ classId: number; studentId: number }>(api.delete(`/classes/${classId}/students/${studentId}`));
