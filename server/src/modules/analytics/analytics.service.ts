import type { Prisma } from "@prisma/client";
import { vnDayStart, vnNextDayStart } from "../../ai/ai.usage";
import { prisma } from "../../config/prisma";
import { buildAnalyticsOverview, type AnalyticsOverviewAggregates } from "./analytics.overview";
import type { AnalyticsOverviewQuery } from "./analytics.schema";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getAnalyticsOverview(
  { days }: AnalyticsOverviewQuery,
  now = new Date(),
  db: Prisma.TransactionClient = prisma
) {
  const windowStart = new Date(now.getTime() - days * DAY_MS);
  const window = { gte: windowStart, lte: now };
  const today = { gte: vnDayStart(now), lt: vnNextDayStart(now) };

  const [
    users,
    classCount,
    assignmentCount,
    openAssignmentCount,
    exercises,
    attempts,
    averageScores,
    aiUsage,
    aiUsageToday,
    reports,
  ] = await Promise.all([
    db.user.groupBy({ by: ["role", "status"], _count: { _all: true } }),
    db.class.count(),
    db.assignment.count(),
    db.assignment.count({ where: { dueAt: { gt: now } } }),
    db.exercise.groupBy({ by: ["status", "source", "inLibrary"], _count: { _all: true } }),
    db.attempt.groupBy({
      by: ["mode", "isLate"],
      where: { submittedAt: window },
      _count: { _all: true },
    }),
    // PostgreSQL xếp NaN cao hơn mọi số hữu hạn, nên BETWEEN cũng loại NaN.
    db.$queryRaw<AnalyticsOverviewAggregates["averageScores"]>`
      SELECT e.skill, AVG(COALESCE(a.teacher_score, a.score)) AS average
      FROM attempts a
      JOIN exercises e ON e.id = a.exercise_id
      WHERE a.submitted_at BETWEEN ${windowStart} AND ${now}
        AND COALESCE(a.teacher_score, a.score) BETWEEN 0 AND 10
      GROUP BY e.skill
    `,
    db.aiUsageLog.groupBy({
      by: ["task", "status"],
      where: { createdAt: window },
      _count: { _all: true },
      _sum: { tokens: true },
    }),
    db.aiUsageLog.groupBy({
      by: ["status"],
      where: { createdAt: today },
      _count: { _all: true },
    }),
    db.exerciseReport.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  return buildAnalyticsOverview({
    users,
    classCount,
    assignmentCount,
    openAssignmentCount,
    exercises,
    attempts,
    averageScores,
    aiUsage,
    aiUsageToday,
    reports,
  });
}