import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../config/prisma";
import type { AiDailyLimits } from "../../ai/ai.usage";
import {
  AI_DAILY_LIMITS_KEY,
  dailyLimitsConfigFromRow,
  invalidateAiDailyLimitsCache,
  type AiDailyLimitsConfig,
} from "../../ai/ai.usage.settings";

export async function updateAdminAiLimits(
  adminId: number,
  { student, teacher }: AiDailyLimits,
  db: Pick<PrismaClient, "$transaction"> = prisma,
  invalidateCache: () => void = invalidateAiDailyLimitsCache
): Promise<AiDailyLimitsConfig> {
  const key = AI_DAILY_LIMITS_KEY;
  const to = { student, teacher };
  const template = JSON.stringify(to);

  const updated = await db.$transaction(async (tx) => {
    // Tuần tự hóa cả lần tạo hàng đầu tiên để audit dùng đúng giá trị trước khi ghi.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(0, hashtext(${key}))`;
    const before = await tx.promptTemplate.findUnique({
      where: { key },
      select: { template: true, updatedAt: true },
    });
    const previous = dailyLimitsConfigFromRow(before);
    const from = { student: previous.student, teacher: previous.teacher };

    const row = await tx.promptTemplate.upsert({
      where: { key },
      create: { key, template },
      update: { template },
      select: { updatedAt: true },
    });
    await tx.auditLog.create({
      data: { userId: adminId, action: "ai_limits.update", detail: { from, to } },
    });
    return row;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  invalidateCache();
  return { ...to, source: "db", updated_at: updated.updatedAt.toISOString() };
}