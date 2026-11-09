import type { AuthUser, Role } from "../types/auth";

export const ROLE_HOME: Record<Role, string> = {
  STUDENT: "/student",
  TEACHER: "/teacher",
  ADMIN: "/admin",
};

/** Trang đích sau khi có phiên đăng nhập: chờ duyệt thì về /pending, còn lại theo vai trò. */
export const getHomePath = (user: AuthUser) =>
  user.status === "PENDING" ? "/pending" : ROLE_HOME[user.role];