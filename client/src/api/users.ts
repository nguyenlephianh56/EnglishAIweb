import { api, unwrap } from "./client";
import type { AuthUser } from "../types/auth";

// ============================================================================
// TODO: nối khi backend xong. Hiện backend CHƯA có hai API này (module users còn trống).
// Hợp đồng đề xuất (bật cờ trong features/account/config.ts sau khi backend làm xong):
//   PATCH /users/me           body { name }                         -> data = AuthUser mới
//   POST  /users/me/password  body { currentPassword, newPassword } -> data = null
// Mật khẩu hiện tại sai nên trả 400 (không phải 401) để không bị hiểu là hết phiên.
// ============================================================================

export interface UpdateProfilePayload {
  name: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export const updateProfile = (payload: UpdateProfilePayload) => unwrap<AuthUser>(api.patch("/users/me", payload));

export const changePassword = (payload: ChangePasswordPayload) => unwrap<null>(api.post("/users/me/password", payload));
