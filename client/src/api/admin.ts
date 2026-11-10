import { api, unwrap } from "./client";
import type { AdminUser } from "../types/admin";
import type { Role, UserStatus } from "../types/auth";

/** GET /admin/users?role=&status= (trả mảng, mới nhất trước) */
export const listUsers = (params?: { role?: Role; status?: UserStatus }) =>
  unwrap<AdminUser[]>(api.get("/admin/users", { params }));

/** PATCH /admin/users/:id/approve: giáo viên PENDING -> ACTIVE */
export const approveTeacher = (id: number) => unwrap<AdminUser>(api.patch(`/admin/users/${id}/approve`));
