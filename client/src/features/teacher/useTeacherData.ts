import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listClasses } from "../../api/classes";
import { fetchTeacherUnread, getTeacherOverviewMock } from "./mock/overviewData";

export const TEACHER_CLASSES_KEY = ["teacher", "classes"] as const;
const DAY = 24 * 60 * 60 * 1000;

/** Lớp của giáo viên (GET /classes), dữ liệu THẬT */
export const useTeacherClasses = () => useQuery({ queryKey: TEACHER_CLASSES_KEY, queryFn: listClasses, staleTime: 30 * 1000 });

/** Số thông báo chưa đọc. TODO: nối API thông báo thật. */
export const useTeacherUnread = () => useQuery({ queryKey: ["teacher", "unread"], queryFn: fetchTeacherUnread, staleTime: 60 * 1000 });

/**
 * Dữ liệu trang Tổng quan giáo viên: phần THẬT từ GET /classes, phần GIẢ do getTeacherOverviewMock()
 * (gắn vào lớp thật). TODO: khi có API thống kê, đổi `mock` thành useQuery tương tự.
 */
export function useTeacherOverview(classId: number | "all") {
  const classes = useTeacherClasses();

  const list = useMemo(() => classes.data ?? [], [classes.data]);
  const mock = useMemo(() => getTeacherOverviewMock(list, classId), [list, classId]);

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

  return { classes: list, stats, mock, isLoading: classes.isLoading, isError: classes.isError, refetch: classes.refetch };
}
