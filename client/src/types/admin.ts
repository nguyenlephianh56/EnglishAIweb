import type { Role, UserStatus } from "./auth";

/** Một dòng của GET /admin/users (không có passwordHash) */
export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
}
