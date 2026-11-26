import type { Role, UserStatus } from "../../types/auth";
import type { ExerciseStatus } from "../../types/exercise";
import type { ReportStatus } from "../../types/report";

export const ROLES: Role[] = ["STUDENT", "TEACHER", "ADMIN"];
export const USER_STATUSES: UserStatus[] = ["PENDING", "ACTIVE", "LOCKED"];

export const ROLE_LABEL: Record<Role, string> = { STUDENT: "Học sinh", TEACHER: "Giáo viên", ADMIN: "Quản trị viên" };
export const ROLE_BADGE: Record<Role, string> = { STUDENT: "bg-sky-50 text-sky-700", TEACHER: "bg-teal-50 text-teal-700", ADMIN: "bg-violet-50 text-violet-700" };

export const STATUS_LABEL: Record<UserStatus, string> = { PENDING: "Chờ duyệt", ACTIVE: "Hoạt động", LOCKED: "Đã khóa" };
export const STATUS_BADGE: Record<UserStatus, string> = { PENDING: "bg-amber-50 text-amber-700", ACTIVE: "bg-green-50 text-green-700", LOCKED: "bg-red-50 text-red-700" };

export const EXERCISE_STATUS_LABEL: Record<ExerciseStatus, string> = { DRAFT: "Bản nháp", PROPOSED: "Chờ duyệt", PUBLISHED: "Đã xuất bản", HIDDEN: "Đã ẩn" };

export const REPORT_STATUSES: ReportStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED"];
export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = { OPEN: "Đang mở", IN_PROGRESS: "Đang xử lý", RESOLVED: "Đã xử lý" };
export const REPORT_STATUS_BADGE: Record<ReportStatus, string> = { OPEN: "bg-amber-50 text-amber-700", IN_PROGRESS: "bg-sky-50 text-sky-700", RESOLVED: "bg-green-50 text-green-700" };

export const isRole = (v: string | null): v is Role => v !== null && (ROLES as string[]).includes(v);
export const isUserStatus = (v: string | null): v is UserStatus => v !== null && (USER_STATUSES as string[]).includes(v);

/** Bỏ dấu và chữ hoa để tìm tên tiếng Việt: "Nguyễn" khớp "nguyen" */
export const normalizeText = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase().trim();

/** Tài khoản đã bị ẩn danh có email dạng deleted-<id>@deleted.invalid */
export const isAnonymizedEmail = (email: string) => /^deleted-\d+@deleted\.invalid$/i.test(email);

const MINUTE = 60 * 1000;
/** "Vừa xong" / "5 phút trước" / "3 giờ trước" / "4 ngày trước"; quá 30 ngày thì ghi ngày dd/MM/yyyy */
export function formatRelative(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const diff = now - d.getTime();
  if (diff < MINUTE) return "Vừa xong";
  if (diff < 60 * MINUTE) return `${Math.floor(diff / MINUTE)} phút trước`;
  if (diff < 24 * 60 * MINUTE) return `${Math.floor(diff / (60 * MINUTE))} giờ trước`;
  if (diff < 30 * 24 * 60 * MINUTE) return `${Math.floor(diff / (24 * 60 * MINUTE))} ngày trước`;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
