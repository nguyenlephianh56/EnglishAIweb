import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listUsers } from "../../api/admin";
import { getOverviewMock } from "./mock/overviewData";
import type { OverviewRange } from "../../types/admin";

export const ADMIN_USERS_KEY = ["admin", "users"] as const;
export const PENDING_TEACHERS_KEY = ["admin", "users", "pending-teachers"] as const;

const STALE = 30 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/** Toàn bộ tài khoản (GET /admin/users) */
export const useAdminUsers = () => useQuery({ queryKey: ADMIN_USERS_KEY, queryFn: () => listUsers(), staleTime: STALE });

/** Giáo viên chờ duyệt (GET /admin/users?role=TEACHER&status=PENDING), mới nhất trước */
export const usePendingTeachers = () =>
  useQuery({
    queryKey: PENDING_TEACHERS_KEY,
    queryFn: () => listUsers({ role: "TEACHER", status: "PENDING" }),
    staleTime: STALE,
  });

/**
 * Dữ liệu trang Tổng quan: phần THẬT gọi API qua TanStack Query, phần GIẢ trả trực tiếp.
 * TODO: khi có API thống kê, đổi `mock` thành một useQuery tương tự.
 */
export function useAdminOverview(range: OverviewRange) {
  const users = useAdminUsers();
  const pending = usePendingTeachers();
  const mock = useMemo(() => getOverviewMock(range), [range]);

  const stats = useMemo(() => {
    const list = users.data ?? [];
    const total = list.length;
    const active = list.filter((u) => u.status === "ACTIVE").length;
    const since = Date.now() - 30 * DAY;
    return {
      totalUsers: total,
      activeUsers: active,
      activePercent: total > 0 ? (active / total) * 100 : 0,
      newUsers30d: list.filter((u) => new Date(u.createdAt).getTime() >= since).length,
    };
  }, [users.data]);

  return {
    stats,
    pendingTeachers: pending.data ?? [],
    mock,
    isLoading: users.isLoading || pending.isLoading,
    isError: users.isError || pending.isError,
    /** Thời điểm tải dữ liệu thật gần nhất (ms), 0 nếu chưa tải */
    updatedAt: Math.max(users.dataUpdatedAt, pending.dataUpdatedAt),
    refetch: () => Promise.all([users.refetch(), pending.refetch()]),
  };
}
