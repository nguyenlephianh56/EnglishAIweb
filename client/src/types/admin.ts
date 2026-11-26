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

/** Số liệu của một tài khoản trong GET /admin/users/:id */
export interface AdminUserStats {
  classesTeaching: number;
  classesJoined: number;
  attemptsCount: number;
  exercisesCreated: number;
  aiRequests: { total: number; today: number };
  lastActivityAt: string | null;
}

/** GET /admin/users/:id */
export type AdminUserDetail = AdminUser & { stats: AdminUserStats };

/** Body của PATCH /admin/users/:id: chỉ gửi field thay đổi, ít nhất một */
export interface UpdateUserBody {
  /** 2..100 ký tự sau khi trim, không có ký tự điều khiển */
  name?: string;
  /** Hợp lệ, tối đa 255 ký tự (máy chủ chuyển thành chữ thường) */
  email?: string;
}

/** DELETE /admin/users/:id: "deleted" = xóa hẳn, "anonymized" = giữ dữ liệu, đổi tên/email và KHÓA tài khoản */
export interface DeleteUserResult {
  id: number;
  mode: "deleted" | "anonymized";
}
