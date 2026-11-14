import type { SkillKey } from "./student";

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

export interface OnTimeStats {
  onTime: number;
  late: number;
  missing: number;
}

export type AttentionKind = "MISSING" | "SCORE_DROP" | "WEAK_SKILL";

export interface AttentionStudent {
  id: number;
  name: string;
  className: string;
  kind: AttentionKind;
  /** Nội dung huy hiệu, ví dụ "Chưa nộp 3 bài" */
  reason: string;
}

export type AssignmentStatus = "DUE_SOON" | "ONGOING" | "CLOSED";

export interface RecentAssignment {
  id: number;
  title: string;
  skill: SkillKey;
  className: string;
  dueAt: string;
  submitted: number;
  total: number;
  status: AssignmentStatus;
  /** Số bài đã nộp nhưng chưa chấm */
  ungraded: number;
}

/** Phần dữ liệu trang Tổng quan giáo viên mà backend CHƯA có API (đang là dữ liệu giả) */
export interface TeacherOverviewMock {
  pendingGrading: number;
  todayGrading: number;
  completionRate: number;
  completionDelta: number;
  onTime: OnTimeStats;
  attentionStudents: AttentionStudent[];
  recentAssignments: RecentAssignment[];
}
