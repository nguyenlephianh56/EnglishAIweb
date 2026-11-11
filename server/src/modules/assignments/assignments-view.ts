import { round2 } from "../attempts/attempt-result";
import { MAX_ATTEMPTS_PER_ASSIGNMENT } from "../attempts/attempts.constants";
import { isAnswerRevealed } from "../attempts/attempts-detail";
import {
  toStudentView,
  type StudentExerciseView,
} from "../exercises/exercise-view";
import type { AssignmentStatus } from "./assignments.constants";

/**
 * Phần LOGIC THUẦN của GET /assignments (không đụng DB, nên test được riêng).
 *
 * Danh sách KHÔNG BAO GIỜ chứa answer / explanation / content: các hàm toXxx tự chọn
 * từng field (danh sách trắng), nên field mới của bảng exercises không tự lọt ra.
 */

/**
 * Trạng thái của bài giao với MỘT HS:
 *  - có attempt            -> SUBMITTED (kể cả nộp trễ; cờ trễ nằm ở lateSubmission)
 *  - chưa có, now > dueAt  -> OVERDUE
 *  - chưa có, còn hạn      -> NOT_STARTED
 * Đúng hạn chót (now == dueAt) vẫn là còn hạn, khớp với is_late = submitted_at > due_at.
 * Điều kiện lọc ?status= trong service phải khớp đúng ranh giới này.
 */
export const computeStatus = (
  attemptsUsed: number,
  dueAt: Date,
  now: Date
): AssignmentStatus => {
  if (attemptsUsed > 0) return "SUBMITTED";
  return now.getTime() > dueAt.getTime() ? "OVERDUE" : "NOT_STARTED";
};

const roundOrNull = (value: number | null): number | null =>
  value === null ? null : round2(value);

/** Thông tin bài tập rút gọn: KHÔNG có content, answer, explanation. */
export interface ExerciseBrief {
  id: number;
  type: string;
  skill: string;
  level: string;
  topic: string;
}

export const toExerciseBrief = (exercise: ExerciseBrief): ExerciseBrief => ({
  id: exercise.id,
  type: exercise.type,
  skill: exercise.skill,
  level: exercise.level,
  topic: exercise.topic,
});

export interface ClassBrief {
  id: number;
  name: string;
}

// ---------------------------------------------------------------------------
// HỌC SINH
// ---------------------------------------------------------------------------

export interface StudentAssignmentRow {
  id: number;
  dueAt: Date;
  exercise: ExerciseBrief;
  class: ClassBrief;
}

/** Số liệu gộp từ bảng attempts của MỘT HS cho MỘT bài giao. */
export interface StudentAttemptStats {
  attemptsUsed: number;
  /** MAX(COALESCE(teacher_score, score)); null nếu chưa có điểm. */
  best: number | null;
  /** Có ít nhất một lần nộp is_late = true. */
  late: boolean;
}

export interface StudentAssignmentItem {
  assignmentId: number;
  exercise: ExerciseBrief;
  class: ClassBrief;
  dueAt: Date;
  status: AssignmentStatus;
  attemptsUsed: number;
  maxAttempts: number;
  bestScore: number | null;
  lateSubmission: boolean;
}

export const toStudentAssignmentItem = (
  row: StudentAssignmentRow,
  stats: StudentAttemptStats | undefined,
  now: Date
): StudentAssignmentItem => {
  const attemptsUsed = stats?.attemptsUsed ?? 0;
  return {
    assignmentId: row.id,
    exercise: toExerciseBrief(row.exercise),
    class: { id: row.class.id, name: row.class.name },
    dueAt: row.dueAt,
    status: computeStatus(attemptsUsed, row.dueAt, now),
    attemptsUsed,
    maxAttempts: MAX_ATTEMPTS_PER_ASSIGNMENT,
    bestScore: roundOrNull(stats?.best ?? null),
    lateSubmission: stats?.late ?? false,
  };
};

/** Chi tiết một bài giao: giống một dòng danh sách, nhưng `exercise` là ĐỀ để làm bài. */
export interface StudentAssignmentDetailRow {
  id: number;
  dueAt: Date;
  exercise: ExerciseBrief & { content: unknown; explanation: string | null };
  class: ClassBrief;
}

export type StudentAssignmentDetail = Omit<StudentAssignmentItem, "exercise"> & {
  exercise: StudentExerciseView;
};

/**
 * Dựng chi tiết bài giao cho HS.
 *  - Đề đi qua toStudentView (danh sách trắng): KHÔNG BAO GIỜ có `answer`.
 *  - `explanation` chỉ có khi now > dueAt (4c.4), dùng chung isAnswerRevealed với T4.
 *    Chưa tới hạn -> không có cả key `explanation` (không trả null để khỏi gợi ý có giải thích).
 * Các field còn lại (status, attemptsUsed, bestScore...) dùng đúng hàm của danh sách.
 */
export const toStudentAssignmentDetail = (
  row: StudentAssignmentDetailRow,
  stats: StudentAttemptStats | undefined,
  now: Date
): StudentAssignmentDetail => {
  const item = toStudentAssignmentItem(row, stats, now);
  return {
    ...item,
    exercise: toStudentView(row.exercise, {
      revealExplanation: isAnswerRevealed(row.id, row.dueAt, now),
    }),
  };
};

// ---------------------------------------------------------------------------
// GIÁO VIÊN
// ---------------------------------------------------------------------------

export interface TeacherAssignmentRow {
  id: number;
  dueAt: Date;
  remindBeforeH: number[];
  createdAt: Date;
  exercise: ExerciseBrief;
  class: { id: number; name: string; _count: { members: number } };
}

export interface TeacherAssignmentItem {
  assignmentId: number;
  exercise: ExerciseBrief;
  class: ClassBrief;
  dueAt: Date;
  remindBeforeHours: number[];
  createdAt: Date;
  /** Số HS (còn trong lớp) đã nộp ít nhất 1 lần. */
  submittedCount: number;
  /** Tổng số HS hiện có trong lớp. */
  totalStudents: number;
}

export const toTeacherAssignmentItem = (
  row: TeacherAssignmentRow,
  submittedCount: number
): TeacherAssignmentItem => ({
  assignmentId: row.id,
  exercise: toExerciseBrief(row.exercise),
  class: { id: row.class.id, name: row.class.name },
  dueAt: row.dueAt,
  remindBeforeHours: row.remindBeforeH,
  createdAt: row.createdAt,
  submittedCount,
  totalStudents: row.class._count.members,
});

// ---------------------------------------------------------------------------
// GIÁO VIÊN: bài nộp của cả lớp cho MỘT bài giao
// ---------------------------------------------------------------------------

/** HS trong lớp. Hàm chỉ lấy id/name/email nên passwordHash không thể lọt ra. */
export interface SubmissionStudent {
  id: number;
  name: string;
  email: string;
}

/** Số liệu attempts của MỘT HS cho bài giao này (đã gộp trong SQL). */
export interface SubmissionStats {
  attemptsUsed: number;
  /** MAX(COALESCE(teacher_score, score)); null nếu chưa lần nào có điểm. */
  best: number | null;
  /** Id của lần nộp có điểm cao nhất (hòa điểm: lần sớm nhất). */
  bestAttemptId: number;
  late: boolean;
  lastSubmittedAt: Date;
}

export interface SubmissionItem {
  studentId: number;
  name: string;
  email: string;
  status: AssignmentStatus;
  attemptsUsed: number;
  bestScore: number | null;
  /** Lần nộp có điểm cao nhất. null nếu chưa nộp hoặc chưa lần nào có điểm. */
  bestAttemptId: number | null;
  lastSubmittedAt: Date | null;
  lateSubmission: boolean;
}

export const toSubmissionItem = (
  student: SubmissionStudent,
  stats: SubmissionStats | undefined,
  dueAt: Date,
  now: Date
): SubmissionItem => {
  const attemptsUsed = stats?.attemptsUsed ?? 0;
  const best = stats?.best ?? null;
  return {
    studentId: student.id,
    name: student.name,
    email: student.email,
    status: computeStatus(attemptsUsed, dueAt, now),
    attemptsUsed,
    bestScore: roundOrNull(best),
    // Chưa có điểm thì không có "lần điểm cao nhất" để trỏ tới.
    bestAttemptId: stats !== undefined && best !== null ? stats.bestAttemptId : null,
    lastSubmittedAt: stats?.lastSubmittedAt ?? null,
    lateSubmission: stats?.late ?? false,
  };
};

export interface SubmissionsResponse {
  assignment: {
    assignmentId: number;
    exercise: ExerciseBrief;
    class: ClassBrief;
    dueAt: Date;
    maxAttempts: number;
  };
  /** Số HS hiện có trong lớp. */
  totalStudents: number;
  /** Số HS (trong danh sách) đã nộp ít nhất 1 lần. */
  submittedCount: number;
  /** MỌI HS trong lớp, kể cả chưa làm, theo thứ tự `students` truyền vào. */
  items: SubmissionItem[];
}

/**
 * Ghép danh sách HS của lớp với số liệu attempts. Lặp theo `students` (không theo stats),
 * nên HS chưa làm vẫn có dòng, còn attempt của người không thuộc lớp bị bỏ qua.
 */
export const buildSubmissionsResponse = (
  assignment: {
    id: number;
    dueAt: Date;
    exercise: ExerciseBrief;
    class: ClassBrief;
  },
  students: SubmissionStudent[],
  statsByStudent: Map<number, SubmissionStats>,
  now: Date
): SubmissionsResponse => {
  const items = students.map((student) =>
    toSubmissionItem(student, statsByStudent.get(student.id), assignment.dueAt, now)
  );
  return {
    assignment: {
      assignmentId: assignment.id,
      exercise: toExerciseBrief(assignment.exercise),
      class: { id: assignment.class.id, name: assignment.class.name },
      dueAt: assignment.dueAt,
      maxAttempts: MAX_ATTEMPTS_PER_ASSIGNMENT,
    },
    totalStudents: items.length,
    submittedCount: items.filter((item) => item.attemptsUsed > 0).length,
    items,
  };
};

// ---------------------------------------------------------------------------

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  /** Tổng số dòng khớp bộ lọc (toàn bộ, không chỉ trang này). */
  total: number;
}

export const buildPage = <T>(
  items: T[],
  page: number,
  limit: number,
  total: number
): Page<T> => ({ items, page, limit, total });