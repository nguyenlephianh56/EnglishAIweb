import { api, unwrap } from "./client";
import type { JoinedClass } from "../types/student";

/** Học sinh tham gia lớp bằng mã 6 ký tự. Backend tự chuẩn hóa chữ HOA. */
export const joinClass = (code: string) => unwrap<JoinedClass>(api.post("/classes/join", { code }));
