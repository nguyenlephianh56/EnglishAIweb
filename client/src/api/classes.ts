import { api, unwrap } from "./client";
import type { JoinedClass } from "../types/student";
import type { ClassSummary } from "../types/teacher";

/** Học sinh tham gia lớp bằng mã 6 ký tự. Backend tự chuẩn hóa chữ HOA. */
export const joinClass = (code: string) => unwrap<JoinedClass>(api.post("/classes/join", { code }));

/** Giáo viên: danh sách lớp của mình (kèm mã lớp và studentCount). */
export const listClasses = () => unwrap<ClassSummary[]>(api.get("/classes"));
