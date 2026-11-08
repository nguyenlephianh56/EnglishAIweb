import { getErrorCode, getErrorMessage } from "../../api/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateName(value: string): string | undefined {
  const len = value.trim().length;
  if (len < 2) return "Họ và tên phải có ít nhất 2 ký tự";
  if (len > 100) return "Họ và tên không được vượt quá 100 ký tự";
  return undefined;
}

export function validateEmail(value: string): string | undefined {
  const v = value.trim();
  if (!v) return "Vui lòng nhập email";
  if (v.length > 255 || !EMAIL_RE.test(v)) return "Email không hợp lệ";
  return undefined;
}

/** Đăng ký: tối thiểu 8 ký tự (khớp backend). */
export function validateNewPassword(value: string): string | undefined {
  if (!value) return "Vui lòng nhập mật khẩu";
  if (value.length < 8) return "Mật khẩu phải có ít nhất 8 ký tự";
  return undefined;
}

/** Đăng nhập: chỉ cần không để trống (backend cũng chỉ yêu cầu vậy, tránh chặn tài khoản cũ). */
export function validateLoginPassword(value: string): string | undefined {
  return value ? undefined : "Vui lòng nhập mật khẩu";
}

export type AuthFailure = { kind: "pending" } | { kind: "message"; message: string };

/** Quy lỗi từ server về hành động: chờ duyệt thì chuyển /pending, còn lại là thông báo hiển thị. */
export function interpretAuthError(error: unknown): AuthFailure {
  const code = getErrorCode(error);
  if (code === "ACCOUNT_PENDING") return { kind: "pending" };
  if (code === "ACCOUNT_LOCKED") {
    return { kind: "message", message: "Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên." };
  }
  return { kind: "message", message: getErrorMessage(error) };
}