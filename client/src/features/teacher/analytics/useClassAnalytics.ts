import { useMemo } from "react";
import { useTeacherClasses } from "../useTeacherData";
import { getClassAnalyticsMock } from "../mock/analyticsData";

/**
 * Dữ liệu phân tích của MỘT lớp. Danh sách lớp là THẬT (GET /classes); số liệu phân tích là GIẢ.
 * TODO(backend): khi có API thống kê theo lớp, thay getClassAnalyticsMock bằng useQuery gọi API đó
 * (giữ nguyên kiểu ClassAnalytics trong types/analytics.ts).
 */
export function useClassAnalytics(classId: number | undefined) {
  const classes = useTeacherClasses();
  const list = useMemo(() => classes.data ?? [], [classes.data]);
  const data = useMemo(() => (classId === undefined ? undefined : getClassAnalyticsMock(list, classId)), [list, classId]);
  return { classes: list, data, isLoading: classes.isLoading, isError: classes.isError, refetch: classes.refetch };
}
