import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getClass, listClasses } from "../../api/classes";
import { getTeacherOverviewMock } from "./mock/overviewData";

export const TEACHER_CLASSES_KEY = ["teacher", "classes"] as const;
const DAY = 24 * 60 * 60 * 1000;

export const teacherClassKey = (id: number) => ["teacher", "classes", id] as const;

/** Chi tiết một lớp + danh sách học sinh (GET /classes/:id), dữ liệu THẬT. Tắt khi id không hợp lệ. */
export const useClassDetail = (id: number) =>
  useQuery({ queryKey: teacherClassKey(id), queryFn: () => getClass(id), enabled: Number.isInteger(id) && id > 0, staleTime: 30 * 1000, retry: false });

/** Lớp của giáo viên (GET /classes), dữ liệu THẬT */
export const useTeacherClasses = () => useQuery({ queryKey: TEACHER_CLASSES_KEY, queryFn: listClasses, staleTime: 30 * 1000 });

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
