import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteUser, promoteAdmin, revokeAdmin, updateUser } from "../../api/admin";
import { getErrorCode, getErrorMessage } from "../../api/client";
import { ADMIN_USERS_KEY, PENDING_TEACHERS_KEY, adminUserKey } from "./useAdminData";
import type { AdminUserDetail, UpdateUserBody } from "../../types/admin";

const CODE_MESSAGE: Record<string, string> = {
  USER_NOT_FOUND: "Không tìm thấy tài khoản này",
  EMAIL_ALREADY_EXISTS: "Email đã được sử dụng",
  CANNOT_DELETE_SELF: "Không thể xóa chính tài khoản của bạn",
  CANNOT_DELETE_ADMIN: "Phải thu hồi quyền admin trước khi xóa tài khoản này",
  USER_ALREADY_ANONYMIZED: "Tài khoản này đã được ẩn danh",
  USER_FOREIGN_KEY_CONFLICT: "Dữ liệu của tài khoản vừa thay đổi, vui lòng thử lại",
  USER_ALREADY_ADMIN: "Tài khoản này đã là quản trị viên",
  INVALID_STATUS: "Chỉ bổ nhiệm được tài khoản đang hoạt động (không phải chờ duyệt hoặc đã khóa)",
  USER_ROLE_CONFLICT: "Tài khoản vừa thay đổi, vui lòng tải lại trang và thử lại",
  CANNOT_REVOKE_SELF: "Không thể thu hồi quyền quản trị của chính bạn",
  USER_NOT_ADMIN: "Tài khoản này không phải quản trị viên",
  LAST_ACTIVE_ADMIN: "Phải còn ít nhất một quản trị viên đang hoạt động",
  USER_OWNS_CLASSES: "Tài khoản đang là chủ của lớp học nên không thể hạ xuống Học sinh, hãy chọn Giáo viên",
};

/** Thông báo lỗi tiếng Việt: theo mã lỗi đã biết, nếu không thì dùng thông điệp của máy chủ */
export function userOpErrorMessage(err: unknown, fallback = "Không thực hiện được thao tác, vui lòng thử lại."): string {
  const code = getErrorCode(err);
  return (code && CODE_MESSAGE[code]) || getErrorMessage(err, fallback);
}

export type OpNotice = { type: "success" | "warning"; text: string };

/**
 * Sửa thông tin / bổ nhiệm / thu hồi quyền quản trị / xóa một tài khoản (trang chi tiết).
 * Lỗi nằm ở `.error` của từng mutation (hiện trong hộp thoại); `notice` là kết quả thành công, tự ẩn sau vài giây.
 * Sau khi xong làm mới danh sách tài khoản, giáo viên chờ duyệt và chi tiết tài khoản.
 */
export function useAdminUserOps(user: AdminUserDetail) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<OpNotice | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
    void queryClient.invalidateQueries({ queryKey: PENDING_TEACHERS_KEY });
    void queryClient.invalidateQueries({ queryKey: adminUserKey(user.id) });
  };

  const edit = useMutation({
    mutationFn: (body: UpdateUserBody) => updateUser(user.id, body),
    onSuccess: () => setNotice({ type: "success", text: "Đã cập nhật thông tin tài khoản." }),
    onSettled: refresh,
  });
  const promote = useMutation({
    mutationFn: () => promoteAdmin(user.id),
    onSuccess: () => setNotice({ type: "success", text: `Đã bổ nhiệm ${user.name} làm quản trị viên.` }),
    onSettled: refresh,
  });
  const revoke = useMutation({
    mutationFn: (role: "TEACHER" | "STUDENT") => revokeAdmin(user.id, role),
    onSuccess: () => setNotice({ type: "success", text: `Đã thu hồi quyền quản trị của ${user.name}.` }),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: () => deleteUser(user.id),
    onSuccess: (res) => {
      if (res.mode === "deleted") {
        queryClient.removeQueries({ queryKey: adminUserKey(user.id) });
        void queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
        void queryClient.invalidateQueries({ queryKey: PENDING_TEACHERS_KEY });
        navigate("/admin/users", { state: { notice: `Đã xóa tài khoản ${user.name}.` } });
      } else {
        setNotice({ type: "warning", text: "Tài khoản có dữ liệu liên quan nên đã được ẩn danh và khóa: tên và email được thay bằng giá trị tạm, lịch sử vẫn được giữ lại." });
        refresh();
      }
    },
  });

  useEffect(() => {
    if (notice?.type !== "success") return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  return { edit, promote, revoke, remove, notice, clearNotice: () => setNotice(null) };
}
