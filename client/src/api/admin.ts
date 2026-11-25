import { api, unwrap } from "./client";
import type { AdminUser, AdminUserDetail, DeleteUserResult, UpdateUserBody } from "../types/admin";
import type { Role, UserStatus } from "../types/auth";

/** GET /admin/users?role=&status= (trả mảng, mới nhất trước) */
export const listUsers = (params?: { role?: Role; status?: UserStatus }) =>
  unwrap<AdminUser[]>(api.get("/admin/users", { params }));

/** PATCH /admin/users/:id/approve: giáo viên PENDING -> ACTIVE */
export const approveTeacher = (id: number) => unwrap<AdminUser>(api.patch(`/admin/users/${id}/approve`));

/** PATCH /admin/users/:id/lock: ACTIVE -> LOCKED (403 CANNOT_LOCK_SELF / CANNOT_LOCK_ADMIN, 409 INVALID_STATUS) */
export const lockUser = (id: number) => unwrap<AdminUser>(api.patch(`/admin/users/${id}/lock`));

/** PATCH /admin/users/:id/unlock: LOCKED -> ACTIVE (409 INVALID_STATUS nếu không đang bị khóa) */
export const unlockUser = (id: number) => unwrap<AdminUser>(api.patch(`/admin/users/${id}/unlock`));

/** GET /admin/users/:id: tài khoản kèm số liệu (404 USER_NOT_FOUND) */
export const getUser = (id: number) => unwrap<AdminUserDetail>(api.get(`/admin/users/${id}`));

/** PATCH /admin/users/:id: sửa tên/email (409 EMAIL_ALREADY_EXISTS, 404) */
export const updateUser = (id: number, body: UpdateUserBody) => unwrap<AdminUser>(api.patch(`/admin/users/${id}`, body));

/** DELETE /admin/users/:id (không body): xóa hẳn hoặc ẩn danh nếu có dữ liệu liên quan */
export const deleteUser = (id: number) => unwrap<DeleteUserResult>(api.delete(`/admin/users/${id}`));

/** PATCH /admin/users/:id/promote-admin (KHÔNG gửi body): chỉ STUDENT/TEACHER đang ACTIVE */
export const promoteAdmin = (id: number) => unwrap<AdminUser>(api.patch(`/admin/users/${id}/promote-admin`));

/** PATCH /admin/users/:id/revoke-admin body { role }: hạ quản trị viên xuống vai trò khác */
export const revokeAdmin = (id: number, role: "TEACHER" | "STUDENT") => unwrap<AdminUser>(api.patch(`/admin/users/${id}/revoke-admin`, { role }));
