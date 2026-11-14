import type { CefrLevel } from "./student";
import type { LibrarySkill } from "./library";

/** Trạng thái của một bài giao đối với MỘT học sinh (backend tự tính theo hạn nộp và lượt làm) */
export type AssignmentStatus = "NOT_STARTED" | "SUBMITTED" | "OVERDUE";

/** Một phần tử của GET /assignments khi đăng nhập là học sinh */
export interface AssignmentItem {
  assignmentId: number;
  exercise: {
    id: number;
    type: string;
    skill: LibrarySkill;
    level: CefrLevel;
    topic: string;
  };
  class: { id: number; name: string };
  /** Hạn nộp, ISO 8601 */
  dueAt: string;
  status: AssignmentStatus;
  attemptsUsed: number;
  maxAttempts: number;
  /** Điểm cao nhất các lần làm (thang 10); null nếu chưa làm */
  bestScore: number | null;
  /** Có lần nộp sau hạn */
  lateSubmission: boolean;
}

export interface AssignmentListResult {
  items: AssignmentItem[];
  page: number;
  limit: number;
  total: number;
}

export interface AssignmentListParams {
  status?: AssignmentStatus;
  classId?: number;
  page?: number;
  limit?: number;
}
