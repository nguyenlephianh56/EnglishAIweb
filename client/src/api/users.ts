import { api, unwrap } from "./client";

// ============================================================================
// TODO: nối khi backend xong. Hiện backend CHƯA có API này (module users còn trống).
// Hợp đồng đề xuất (bật cờ trong features/account/config.ts sau khi backend làm xong):
//   POST  /users/me/password  body { currentPassword, newPassword } -> data = null
// Mật khẩu hiện tại sai nên trả 400 (không phải 401) để không bị hiểu là hết phiên.
// ============================================================================

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export const changePassword = (payload: ChangePasswordPayload) => unwrap<null>(api.post("/users/me/password", payload));
