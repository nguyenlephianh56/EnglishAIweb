import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "./mock/notificationData";
import type { AppNotification } from "../../types/notification";

export const NOTIFICATIONS_KEY = ["student", "notifications"] as const;
const EMPTY: AppNotification[] = [];

/**
 * Danh sách thông báo của học sinh + số chưa đọc.
 * MỘT nguồn dữ liệu cho cả sidebar (badge số), chuông ở thanh trên và trang Thông báo,
 * nhờ cache của TanStack Query nên đánh dấu đã đọc ở đâu thì mọi nơi cùng cập nhật.
 * TODO: đổi sang API thật (xem mock/notificationData.ts).
 */
export function useNotifications() {
  const query = useQuery({ queryKey: NOTIFICATIONS_KEY, queryFn: fetchNotifications, staleTime: 5 * 60 * 1000 });
  const items = query.data ?? EMPTY;
  const unread = items.reduce((count, n) => count + (n.read ? 0 : 1), 0);
  return { ...query, items, unread };
}

interface Snapshot {
  previous?: AppNotification[];
}

/** Đánh dấu đã đọc: cập nhật giao diện ngay (lạc quan), lỗi thì hoàn lại */
export function useNotificationActions() {
  const queryClient = useQueryClient();

  async function applyOptimistic(update: (list: AppNotification[]) => AppNotification[]): Promise<Snapshot> {
    await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
    const previous = queryClient.getQueryData<AppNotification[]>(NOTIFICATIONS_KEY);
    queryClient.setQueryData<AppNotification[]>(NOTIFICATIONS_KEY, (old) => (old ? update(old) : old));
    return { previous };
  }

  function rollback(_error: unknown, _variables: unknown, context: Snapshot | undefined) {
    if (context?.previous) queryClient.setQueryData(NOTIFICATIONS_KEY, context.previous);
  }

  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onMutate: (id: number) => applyOptimistic((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n))),
    onError: rollback,
    // TODO khi nối API thật: onSettled: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
  });

  const markAllRead = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => applyOptimistic((list) => list.map((n) => ({ ...n, read: true }))),
    onError: rollback,
  });

  return { markRead: markRead.mutate, markAllRead: markAllRead.mutate, markingAll: markAllRead.isPending };
}
