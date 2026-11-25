import type { LibrarySkill } from "./library";

/** Một phần tử của GET /classes khi đăng nhập là giáo viên */
export interface ClassSummary {
  id: number;
  name: string;
  code: string;
  createdAt: string;
  studentCount: number;
  teacher?: { id: number; name: string };
}

/** Học sinh trong một lớp (GET /classes/:id và kết quả POST /classes/:id/students) */
export interface ClassStudent {
  id: number;
  name: string;
  email: string;
  /** Thời điểm vào lớp, ISO 8601 */
  joinedAt: string;
}

/** GET /classes/:id */
export interface ClassDetail {
  id: number;
  name: string;
  code: string;
  createdAt: string;
  teacher: { id: number; name: string };
  studentCount: number;
  students: ClassStudent[];
}

/** Thống kê nộp bài của các bài giao gần nhất: đúng hạn / nộp trễ / quá hạn chưa nộp */
export interface OnTimeStats {
  onTime: number;
  late: number;
  missing: number;
}

/** Học sinh cần chú ý: có bài giao quá hạn mà chưa nộp ("Chưa nộp {overdueCount} bài quá hạn") */
export interface AttentionStudent {
  id: number;
  name: string;
  /** Lớp của bài quá hạn gần nhất */
  className: string;
  classId: number;
  overdueCount: number;
}

export type AssignmentStatus = "DUE_SOON" | "ONGOING" | "CLOSED";

export interface RecentAssignment {
  /** assignmentId */
  id: number;
  title: string;
  skill: LibrarySkill;
  className: string;
  dueAt: string;
  submitted: number;
  total: number;
  status: AssignmentStatus;
  /** Tỷ lệ học sinh có bài chưa được giáo viên chấm (bài Viết/Nói); null khi chưa tải được bài nộp */
  ungradedRatio: number | null;
}
