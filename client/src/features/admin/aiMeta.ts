/** Tên tiếng Việt của prompt theo key; key lạ hiện nguyên key */
export const PROMPT_LABEL: Record<string, string> = {
  writing_grade: "Chấm bài Viết",
  exercise_generate: "Sinh bài tập",
  listening_generate: "Kịch bản bài Nghe",
  speaking_transcribe: "Chữ hóa giọng nói",
  speaking_grade: "Chấm bài Nói",
};
export const promptLabel = (key: string) => PROMPT_LABEL[key] ?? key;

/** Hành động trong nhật ký; hành động lạ hiện nguyên chuỗi */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "user.approve": "Duyệt giáo viên",
  "user.update": "Sửa thông tin tài khoản",
  "user.delete": "Xóa tài khoản",
  "user.anonymize": "Ẩn danh tài khoản",
  "user.promote_admin": "Bổ nhiệm quản trị viên",
  "user.revoke_admin": "Thu hồi quyền quản trị",
  "exercise.propose": "Đề xuất bài",
  "exercise.approve": "Duyệt bài",
  "exercise.publish": "Xuất bản bài",
  "exercise.reject": "Từ chối bài",
  "report.update": "Cập nhật báo lỗi",
  "prompt.update": "Sửa prompt",
  "prompt.reset": "Khôi phục prompt",
  "ai_limits.update": "Đổi giới hạn lượt AI",
};
export const auditActionLabel = (action: string) => AUDIT_ACTION_LABEL[action] ?? action;

export const AI_LIMIT_MIN = 1;
export const AI_LIMIT_MAX = 1000;
export const PROMPT_MAX_LENGTH = 20000;