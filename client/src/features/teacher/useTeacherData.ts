import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getClass, listClasses } from "../../api/classes";
import { getAssignmentSubmissions } from "../../api/assignments";
import { TEACHER_ASSIGNMENTS_KEY, useAllTeacherAssignments } from "./assignments/useTeacherAssignments";
import type { SubmissionItem, TeacherAssignmentItem } from "../../types/assignments";
import type { AssignmentStatus, AttentionStudent, OnTimeStats, RecentAssignment } from "../../types/teacher";

export const TEACHER_CLASSES_KEY = ["teacher", "classes"] as const;
const DAY = 24 * 60 * 60 * 1000;

export const teacherClassKey = (id: number) => ["teacher", "classes", id] as const;

/** Chi tiết một lớp + danh sách học sinh (GET /classes/:id), dữ liệu THẬT. Tắt khi id không hợp lệ. */
export const useClassDetail = (id: number) =>
  useQuery({ queryKey: teacherClassKey(id), queryFn: () => getClass(id), enabled: Number.isInteger(id) && id > 0, staleTime: 30 * 1000, retry: false });

/** Lớp của giáo viên (GET /classes), dữ liệu THẬT */
export const useTeacherClasses = () => useQuery({ queryKey: TEACHER_CLASSES_KEY, queryFn: listClasses, staleTime: 30 * 1000 });

const HOUR = 60 * 60 * 1000;
/** Số bài giao gần nhất được tải bài nộp để phân tích */
const ANALYSED_LIMIT = 10;
const RECENT_LIMIT = 5;
const ATTENTION_LIMIT = 5;

/** Lần nộp được tính của một học sinh: bài điểm cao nhất, nếu không có thì lần nộp cuối; undefined nếu chưa nộp */
function countedAttempt(s: SubmissionItem) {
  const list = [...(s.attempts ?? [])].sort((a, b) => a.attempt_no - b.attempt_no);
  return list.find((a) => a.is_best) ?? list[list.length - 1];
}

const isManualType = (a: TeacherAssignmentItem) => a.exercise.type === "writing" || a.exercise.type === "speaking";

function statusOf(dueAt: string, now: number): AssignmentStatus {
  const due = new Date(dueAt).getTime();
  if (due < now) return "CLOSED";
  return due - now <= 24 * HOUR ? "DUE_SOON" : "ONGOING";
}

/**
 * Dữ liệu trang Tổng quan giáo viên, ghép phía client từ API có sẵn (chưa có API thống kê):
 * GET /classes, GET /assignments (tất cả) và GET /assignments/:id/submissions của 10 bài giao gần nhất trong 30 ngày.
 * Bài nộp dùng cùng query key với useAssignmentSubmissions nên chia sẻ cache; một bài lỗi không làm hỏng cả trang.
 */
export function useTeacherOverview(classId: number | "all") {
  const classes = useTeacherClasses();
  const assignments = useAllTeacherAssignments(classId === "all" ? undefined : classId);

  const list = useMemo(() => classes.data ?? [], [classes.data]);

  const stats = useMemo(() => {
    const studentTotal = list.reduce((sum, c) => sum + c.studentCount, 0);
    const since = Date.now() - 30 * DAY;
    return {
      classCount: list.length,
      studentTotal,
      avgPerClass: list.length > 0 ? studentTotal / list.length : 0,
      newClasses30d: list.filter((c) => new Date(c.createdAt).getTime() >= since).length,
    };
  }, [list]);

  // Bài giao có hạn nộp trong 30 ngày qua (gồm cả bài chưa đến hạn), hạn nộp mới nhất trước
  const windowItems = useMemo(() => {
    const since = Date.now() - 30 * DAY;
    return (assignments.data?.items ?? []).filter((a) => new Date(a.dueAt).getTime() >= since).sort((a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime());
  }, [assignments.data]);
  const analysed = useMemo(() => windowItems.slice(0, ANALYSED_LIMIT), [windowItems]);

  const subs = useQueries({
    queries: analysed.map((a) => ({
      queryKey: [...TEACHER_ASSIGNMENTS_KEY, "submissions", a.assignmentId] as const,
      queryFn: () => getAssignmentSubmissions(a.assignmentId),
      staleTime: 60 * 1000,
      retry: false,
    })),
  });

  const subsLoading = subs.some((q) => q.isLoading);
  const failed = subs.filter((q) => q.isError);
  const loadedItems = (a: TeacherAssignmentItem, i: number) => (analysed[i]?.assignmentId === a.assignmentId ? subs[i]?.data?.items : undefined);

  // ---- Tỷ lệ hoàn thành: trên TẤT CẢ bài giao trong 30 ngày ----
  const submittedSum = windowItems.reduce((n, a) => n + a.submittedCount, 0);
  const totalSum = windowItems.reduce((n, a) => n + a.totalStudents, 0);
  const completion = { rate: totalSum > 0 ? Math.round((100 * submittedSum) / totalSum) : null, submitted: submittedSum, total: totalSum };

  // ---- Các số tính từ bài nộp của tập phân tích ----
  const onTime: OnTimeStats = { onTime: 0, late: 0, missing: 0 };
  let pendingCount = 0;
  let waitingAi = 0;
  const overdueBy = new Map<number, AttentionStudent>();

  analysed.forEach((a, i) => {
    const items = subs[i]?.data?.items;
    if (!items) return;
    for (const s of items) {
      if (s.status === "SUBMITTED") {
        if (s.lateSubmission) onTime.late += 1;
        else onTime.onTime += 1;
      } else if (s.status === "OVERDUE") {
        onTime.missing += 1;
        const cur = overdueBy.get(s.studentId);
        if (cur) cur.overdueCount += 1;
        else overdueBy.set(s.studentId, { id: s.studentId, name: s.name, className: a.class.name, classId: a.class.id, overdueCount: 1 });
      }
      if (isManualType(a)) {
        const c = countedAttempt(s);
        if (c && c.teacher_score === null) {
          pendingCount += 1;
          if (c.grading_status === "PENDING") waitingAi += 1;
        }
      }
    }
  });

  const attentionStudents = [...overdueBy.values()].sort((x, y) => y.overdueCount - x.overdueCount || x.name.localeCompare(y.name, "vi")).slice(0, ATTENTION_LIMIT);

  // ---- Bài tập gần đây: hạn nộp mới nhất trước ----
  const now = Date.now();
  const recentAssignments: RecentAssignment[] = windowItems.slice(0, RECENT_LIMIT).map((a, i) => {
    const items = loadedItems(a, i);
    let ungradedRatio: number | null = null;
    if (items) {
      if (!isManualType(a) || items.length === 0) ungradedRatio = 0;
      else ungradedRatio = items.filter((s) => countedAttempt(s)?.teacher_score === null).length / items.length;
    }
    return {
      id: a.assignmentId,
      title: a.exercise.topic,
      skill: a.exercise.skill,
      className: a.class.name,
      dueAt: a.dueAt,
      submitted: a.submittedCount,
      total: a.totalStudents,
      status: statusOf(a.dueAt, now),
      ungradedRatio,
    };
  });

  return {
    classes: list,
    stats,
    completion,
    onTime,
    /** Số bài Viết/Nói chưa có điểm giáo viên, và số bài trong đó còn đang chờ AI */
    pendingGrading: { count: pendingCount, waitingAi },
    attentionStudents,
    recentAssignments,
    /** Số bài giao gần nhất được dùng để tính OnTime/Attention/Pending */
    analysedCount: analysed.length,
    hasAssignments: (assignments.data?.total ?? assignments.data?.items.length ?? 0) > 0,
    truncated: assignments.data?.truncated ?? false,
    submissionsLoading: subsLoading,
    failedCount: failed.length,
    retryFailed: () => {
      subs.forEach((q) => {
        if (q.isError) void q.refetch();
      });
    },
    assignmentsLoading: assignments.isLoading,
    isLoading: classes.isLoading || assignments.isLoading,
    isError: classes.isError || assignments.isError,
    refetch: () => {
      if (classes.isError) void classes.refetch();
      if (assignments.isError) void assignments.refetch();
    },
  };
}
