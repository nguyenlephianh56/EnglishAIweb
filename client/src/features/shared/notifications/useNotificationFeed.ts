import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationSource } from "./notificationSource";
import type { AppNotification } from "../../../types/notification";

const EMPTY: AppNotification[] = [];

/**
 * Danh sách thông báo + số chưa đọc của MỘT nguồn.
 * Sidebar (badge số), chuông ở thanh trên và trang Thông báo cùng gọi hook này với cùng nguồn,
 * nhờ cache của TanStack Query nên đánh dấu đã đọc ở đâu thì mọi nơi cùng cập nhật.
 */
export function useNotificationFeed(source: NotificationSource) {
  const query = useQuery({ queryKey: source.queryKey, queryFn: source.fetch, staleTime: 5 * 60 * 1000 });
  const items = query.data ?? EMPTY;
  const unread = items.reduce((count, n) => count + (n.read ? 0 : 1), 0);
  return { ...query, items, unread };
}

interface Snapshot {
  previous?: AppNotification[];
}

/** Đánh dấu đã đọc: cập nhật giao diện ngay (lạc quan), lỗi thì hoàn lại */
export function useNotificationActions(source: NotificationSource) {
  const queryClient = useQueryClient();
  const key = source.queryKey;

  async function applyOptimistic(update: (list: AppNotification[]) => AppNotification[]): Promise<Snapshot> {
    await queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData<AppNotification[]>(key);
    queryClient.setQueryData<AppNotification[]>(key, (old) => (old ? update(old) : old));
    return { previous };
  }

  function rollback(_error: unknown, _variables: unknown, context: Snapshot | undefined) {
    if (context?.previous) queryClient.setQueryData(key, context.previous);
  }

  const markRead = useMutation({
    mutationFn: source.markRead,
    onMutate: (id: number) => applyOptimistic((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n))),
    onError: rollback,
    // TODO khi nối API thật: onSettled: () => queryClient.invalidateQueries({ queryKey: key })
  });

  const markAllRead = useMutation({
    mutationFn: source.markAllRead,
    onMutate: () => applyOptimistic((list) => list.map((n) => ({ ...n, read: true }))),
    onError: rollback,
  });

  return { markRead: markRead.mutate, markAllRead: markAllRead.mutate, markingAll: markAllRead.isPending };
}
