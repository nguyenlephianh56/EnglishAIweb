export interface PromptSummary {
  key: string;
  task: string;
  /** Biến được phép dùng trong mẫu ({{tên}}) */
  variables: string[];
  /** Biến bắt buộc phải có trong mẫu */
  required: string[];
  is_default: boolean;
  updated_at: string | null;
}

export interface PromptDetail extends PromptSummary {
  template: string;
}

export interface AiLimits {
  /** Số lượt AI mỗi ngày */
  student: number;
  teacher: number;
  /** "env" = đang dùng giá trị mặc định từ cấu hình máy chủ, chưa lưu vào cơ sở dữ liệu */
  source: "db" | "env";
  updated_at: string | null;
}

export type AiLimitsBody = Pick<AiLimits, "student" | "teacher">;

export interface AuditLogItem {
  id: number;
  /** Dạng "nhóm.hành_động", ví dụ exercise.approve */
  action: string;
  user: { id: number; name: string } | null;
  /** Máy chủ đã che thông tin nhạy cảm */
  detail: Record<string, unknown>;
  created_at: string;
}

export interface ListAuditLogsParams {
  action?: string;
  user_id?: number;
  /** ISO 8601 có múi giờ */
  from?: string;
  to?: string;
  /** 1..100, mặc định 20 */
  limit?: number;
  cursor?: number;
}

export interface ListAuditLogsResult {
  items: AuditLogItem[];
  next_cursor: number | null;
}
