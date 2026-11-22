import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { DEADLINE_NOTIFICATION_KEY_PATTERN, MAX_INT4 } from "./notifications.constants";
import type { NotificationsListQuery } from "./notifications.schema";

const notificationSelect = {
  id: true,
  type: true,
  message: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

const toNotificationItem = (row: NotificationRow) => {
  const type = row.type.split(":", 1)[0];
  const match = DEADLINE_NOTIFICATION_KEY_PATTERN.exec(row.type);
  const assignmentId = match ? Number(match[1]) : null;

  return {
    id: row.id,
    type,
    message: row.message,
    read: row.readAt !== null,
    read_at: row.readAt,
    created_at: row.createdAt,
    assignment_id: assignmentId !== null && assignmentId <= MAX_INT4 ? assignmentId : null,
  };
};

export const countUnreadNotifications = (userId: number) =>
  prisma.notification.count({ where: { userId, readAt: null } });

export const listNotifications = async (
  userId: number,
  { limit, cursor, unread }: NotificationsListQuery
) => {
  // Tìm mốc phân trang trong dữ liệu của chính người dùng, kể cả khi mốc đã được đọc.
  const anchor = cursor === undefined
    ? null
    : await prisma.notification.findFirst({
      where: { id: cursor, userId },
      select: { id: true, createdAt: true },
    });

  if (cursor !== undefined && anchor === null) {
    return { items: [], next_cursor: null, unread_count: await countUnreadNotifications(userId) };
  }

  const where: Prisma.NotificationWhereInput = { userId };
  if (unread) where.readAt = null;
  if (anchor) {
    where.OR = [
      { createdAt: { lt: anchor.createdAt } },
      { createdAt: anchor.createdAt, id: { lt: anchor.id } },
    ];
  }

  // Danh sách và số chưa đọc dùng cùng một ảnh chụp dữ liệu.
  const [rows, unreadCount] = await prisma.$transaction(
    [
      prisma.notification.findMany({
        where,
        select: notificationSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      }),
      countUnreadNotifications(userId),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );

  return {
    items: rows.slice(0, limit).map(toNotificationItem),
    next_cursor: rows.length > limit ? rows[limit - 1].id : null,
    unread_count: unreadCount,
  };
};

export const markNotificationRead = async (userId: number, id: number) => {
  // Lượt gọi đồng thời chỉ có thể đặt readAt khi bản ghi vẫn chưa đọc.
  const [, notification] = await prisma.$transaction(
    [
      prisma.notification.updateMany({
        where: { id, userId, readAt: null },
        data: { readAt: new Date() },
      }),
      prisma.notification.findFirst({ where: { id, userId }, select: notificationSelect }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  );

  return notification ? toNotificationItem(notification) : null;
};

export const markAllNotificationsRead = async (userId: number) => {
  const { count } = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });

  return { updated: count };
};