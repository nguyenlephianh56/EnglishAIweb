import { api, unwrap } from "./client";
import type { AuthUser } from "../types/auth";

// PATCH /users/me sẽ được bật khi có API cập nhật hồ sơ.
export interface UpdateProfilePayload {
  name: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export const updateProfile = (payload: UpdateProfilePayload) => unwrap<AuthUser>(api.patch("/users/me", payload));

export const changePassword = (payload: ChangePasswordPayload) => unwrap<null>(api.post("/users/me/password", payload));