import { ExerciseSource, ExerciseStatus, Role, Skill, UserStatus } from "@prisma/client";
import { AI_TASKS, AI_USAGE_STATUSES } from "../../ai/ai.types";

const ATTEMPT_MODES = ["practice", "exam"] as const;
const REPORT_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;

type CountGroup = { _count: { _all: number } };

export interface AnalyticsOverviewAggregates {
  users: (CountGroup & { role: Role; status: UserStatus })[];
  classCount: number;
  assignmentCount: number;
  openAssignmentCount: number;
  exercises: (CountGroup & { status: ExerciseStatus; source: ExerciseSource; inLibrary: boolean })[];
  attempts: (CountGroup & { mode: string; isLate: boolean })[];
  averageScores: { skill: Skill; average: number | null }[];
  aiUsage: (CountGroup & { task: string; status: string; _sum: { tokens: number | null } })[];
  aiUsageToday: (CountGroup & { status: string })[];
  reports: (CountGroup & { status: string })[];
}

function byCategory<Key extends string, Value>(
  keys: readonly Key[],
  valueFor: (key: Key) => Value
): Record<Key, Value> {
  return Object.fromEntries(keys.map((key) => [key, valueFor(key)])) as Record<Key, Value>;
}

function countGroups<Row extends CountGroup>(
  rows: readonly Row[],
  matches: (row: Row) => boolean = () => true
): number {
  return rows.reduce((total, row) => total + (matches(row) ? row._count._all : 0), 0);
}

/** Ghép các nhóm đã tổng hợp ở DB. Giữ đủ danh mục, kể cả nhóm chưa có số liệu. */
export function buildAnalyticsOverview(aggregates: AnalyticsOverviewAggregates) {
  const { users, exercises, attempts, averageScores, aiUsage, aiUsageToday, reports } = aggregates;

  return {
    users: {
      by_role_and_status: byCategory(Object.values(Role), (role) =>
        byCategory(Object.values(UserStatus), (status) =>
          countGroups(users, (row) => row.role === role && row.status === status)
        )
      ),
    },
    classes: { total: aggregates.classCount },
    assignments: { total: aggregates.assignmentCount, open: aggregates.openAssignmentCount },
    exercises: {
      by_status: byCategory(Object.values(ExerciseStatus), (status) =>
        countGroups(exercises, (row) => row.status === status)
      ),
      by_source: byCategory(Object.values(ExerciseSource), (source) =>
        countGroups(exercises, (row) => row.source === source)
      ),
      in_library: countGroups(exercises, (row) => row.inLibrary),
    },
    attempts: {
      total: countGroups(attempts),
      by_mode: byCategory(ATTEMPT_MODES, (mode) =>
        countGroups(attempts, (row) => row.mode === mode)
      ),
      is_late: countGroups(attempts, (row) => row.isLate),
      average_final_score_by_skill: byCategory(Object.values(Skill), (skill) => {
        const average = averageScores.find((row) => row.skill === skill)?.average ?? 0;
        return Number(average.toFixed(2));
      }),
    },
    ai_usage: {
      by_task_and_status: byCategory(AI_TASKS, (task) =>
        byCategory(AI_USAGE_STATUSES, (status) =>
          countGroups(aiUsage, (row) => row.task === task && row.status === status)
        )
      ),
      total_tokens: aiUsage.reduce((total, row) => total + (row._sum.tokens ?? 0), 0),
      today_by_status: byCategory(AI_USAGE_STATUSES, (status) =>
        countGroups(aiUsageToday, (row) => row.status === status)
      ),
    },
    reports: {
      by_status: byCategory(REPORT_STATUSES, (status) =>
        countGroups(reports, (row) => row.status === status)
      ),
    },
  };
}