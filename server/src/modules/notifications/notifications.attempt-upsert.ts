import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

interface AttemptNotificationInput {
  attemptId: number;
  studentId: number;
  type: string;
  message: string;
  mergeMessage?: (previousMessage: string) => string;
}

export const upsertUnreadAttemptNotification = async ({
  attemptId,
  studentId,
  type,
  message,
  mergeMessage,
}: AttemptNotificationInput): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    // T28 dùng bigint dương theo attempt: T25 dùng bigint âm, các khóa hai int thuộc không gian riêng.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${attemptId}::bigint)`;

    const unread = { userId: studentId, type, readAt: null };
    const latest = await tx.notification.findFirst({
      where: unread,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, message: true },
    });
    const createdAt = new Date();

    if (latest !== null) {
      const { count } = await tx.notification.updateMany({
        where: { id: latest.id, readAt: null },
        data: { createdAt, message: mergeMessage?.(latest.message) },
      });
      await tx.notification.deleteMany({
        where: { ...unread, id: { not: latest.id } },
      });
      if (count > 0) return;
      // HS đã đọc dòng mới nhất sau khi findFirst: giữ dòng đó và tạo thông báo mới.
    }

    await tx.notification.create({
      data: { userId: studentId, type, message, createdAt },
      select: { id: true },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
};