import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { redactDetail } from "./admin.audit-detail";
import type { ListAuditLogsQuery } from "./admin.audit.schema";

export async function listAuditLogs({ action, user_id: userId, from, to, limit, cursor }: ListAuditLogsQuery) {
  const where: Prisma.AuditLogWhereInput = {
    action,
    userId,
    createdAt: from !== undefined || to !== undefined ? { gte: from, lte: to } : undefined,
    id: cursor === undefined ? undefined : { lt: cursor },
  };

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { id: "desc" },
    take: limit + 1,
    select: {
      id: true,
      action: true,
      user: { select: { id: true, name: true } },
      detail: true,
      createdAt: true,
    },
  });

  const items = rows.slice(0, limit).map(({ id, action, user, detail, createdAt }) => ({
    id,
    action,
    user,
    detail: redactDetail(detail),
    created_at: createdAt,
  }));
  return { items, next_cursor: rows.length > limit ? items[limit - 1].id : null };
}