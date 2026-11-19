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

// ---------------------------------------------------------------------------
// PHÍA GIÁO VIÊN (cùng endpoint /assignments nhưng dữ liệu trả về khác học sinh)
// ---------------------------------------------------------------------------

/** Đề của bài giao dạng tóm tắt (không có content/answer) */
export type AssignmentExercise = AssignmentItem["exercise"];

/** Một phần tử của GET /assignments khi đăng nhập là giáo viên */
export interface TeacherAssignmentItem {
  assignmentId: number;
  exercise: AssignmentExercise;
  class: { id: number; name: string };
  /** Hạn nộp, ISO 8601 */
  dueAt: string;
  remindBeforeHours: number[];
  createdAt: string;
  /** Số học sinh (còn trong lớp) đã nộp ít nhất 1 lần */
  submittedCount: number;
  /** Số học sinh hiện có trong lớp */
  totalStudents: number;
}

export interface TeacherAssignmentListResult {
  items: TeacherAssignmentItem[];
  page: number;
  limit: number;
  total: number;
}

export interface TeacherAssignmentListParams {
  classId?: number;
  page?: number;
  /** Tối đa 50 */
  limit?: number;
}

/** Một học sinh trong GET /assignments/:id/submissions */
export interface SubmissionItem {
  studentId: number;
  name: string;
  email: string;
  status: AssignmentStatus;
  attemptsUsed: number;
  /** Điểm cao nhất (thang 10); null nếu chưa có điểm (chưa làm, hoặc bài Viết đang chờ chấm) */
  bestScore: number | null;
  bestAttemptId: number | null;
  lastSubmittedAt: string | null;
  lateSubmission: boolean;
}

/** GET /assignments/:id/submissions */
export interface AssignmentSubmissions {
  assignment: {
    assignmentId: number;
    exercise: AssignmentExercise;
    class: { id: number; name: string };
    dueAt: string;
    maxAttempts: number;
  };
  totalStudents: number;
  submittedCount: number;
  items: SubmissionItem[];
}

/** Body của POST /assignments. dueAt phải là ISO 8601 CÓ múi giờ (ví dụ new Date(x).toISOString()). */
export interface CreateAssignmentBody {
  exerciseId: number;
  classId: number;
  dueAt: string;
  remindBeforeHours?: number[];
}

export interface CreatedAssignment {
  id: number;
  exerciseId: number;
  classId: number;
  assignedById: number;
  dueAt: string;
  remindBeforeHours: number[];
  createdAt: string;
}
