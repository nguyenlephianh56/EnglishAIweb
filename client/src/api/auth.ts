import { api, unwrap } from "./client";
import type { AuthUser } from "../types/auth";

export interface LoginResult {
  user: AuthUser;
  token: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role: "STUDENT" | "TEACHER";
}

export const fetchMe = () => unwrap<AuthUser>(api.get("/auth/me"));

export const login = (email: string, password: string) =>
  unwrap<LoginResult>(api.post("/auth/login", { email, password }));

/** Đăng ký KHÔNG trả token: học sinh phải gọi login sau đó, giáo viên chờ duyệt. */
export const register = (payload: RegisterPayload) => unwrap<AuthUser>(api.post("/auth/register", payload));