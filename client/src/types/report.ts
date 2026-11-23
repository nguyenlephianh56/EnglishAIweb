import type { ExerciseStatus } from "./exercise";
import type { LibrarySkill } from "./library";
import type { CefrLevel } from "./student";

export type ReportStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";
/** Trạng thái quản trị viên được phép chuyển tới (OPEN chỉ là trạng thái ban đầu) */
export type ReportUpdateStatus = "IN_PROGRESS" | "RESOLVED";

export interface ReportItem {
  id: number;
  status: ReportStatus;
  reason: string;
  /** ISO 8601 */
  created_at: string;
  exercise: { id: number; type: string; skill: LibrarySkill; level: CefrLevel; topic: string; status: ExerciseStatus };
  reporter: { id: number; name: string };
}

export interface CreateReportPayload {
  exercise_id: number;
  /** Đã bỏ khoảng trắng đầu/cuối, 1..1000 ký tự */
  reason: string;
}

export interface ListReportsParams {
  status?: ReportStatus;
  exercise_id?: number;
  /** 1..50, mặc định 20 */
  limit?: number;
  /** next_cursor của trang trước */
  cursor?: number;
}

/** Không có tổng số: còn trang sau khi next_cursor khác null */
export interface ListReportsResult {
  items: ReportItem[];
  next_cursor: number | null;
}
