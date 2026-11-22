import { describe, expect, it } from "vitest";
import { buildAnalyticsOverview, type AnalyticsOverviewAggregates } from "./analytics.overview";
import { analyticsOverviewQuerySchema } from "./analytics.schema";

const emptyAggregates: AnalyticsOverviewAggregates = {
  users: [],
  classCount: 0,
  assignmentCount: 0,
  openAssignmentCount: 0,
  exercises: [],
  attempts: [],
  averageScores: [],
  aiUsage: [],
  aiUsageToday: [],
  reports: [],
};

const count = (total: number) => ({ _count: { _all: total } });

describe("query thống kê overview", () => {
  it("mặc định 30 ngày và chấp nhận hai đầu khoảng", () => {
    expect(analyticsOverviewQuerySchema.parse({})).toEqual({ days: 30 });
    expect(analyticsOverviewQuerySchema.parse({ days: "1" })).toEqual({ days: 1 });
    expect(analyticsOverviewQuerySchema.parse({ days: "90" })).toEqual({ days: 90 });
  });

  it.each(["0", "91", "abc", "1.5", ""])("từ chối days = %j", (days) => {
    expect(analyticsOverviewQuerySchema.safeParse({ days }).success).toBe(false);
  });

  it("từ chối nhiều giá trị days trong cùng query", () => {
    expect(analyticsOverviewQuerySchema.safeParse({ days: ["1", "2"] }).success).toBe(false);
  });
});

describe("buildAnalyticsOverview", () => {
  it("điền 0 cho tất cả danh mục khi không có dữ liệu", () => {
    const userStatuses = { PENDING: 0, ACTIVE: 0, LOCKED: 0 };
    const usageStatuses = { ok: 0, error: 0, cached: 0, rate_limited: 0 };

    expect(buildAnalyticsOverview(emptyAggregates)).toEqual({
      users: { by_role_and_status: { STUDENT: userStatuses, TEACHER: userStatuses, ADMIN: userStatuses } },
      classes: { total: 0 },
      assignments: { total: 0, open: 0 },
      exercises: {
        by_status: { DRAFT: 0, PROPOSED: 0, PUBLISHED: 0, HIDDEN: 0 },
        by_source: { ADMIN: 0, TEACHER: 0, AI: 0 },
        in_library: 0,
      },
      attempts: {
        total: 0,
        by_mode: { practice: 0, exam: 0 },
        is_late: 0,
        average_final_score_by_skill: { LISTENING: 0, SPEAKING: 0, READING: 0, WRITING: 0, FOUNDATION: 0 },
      },
      ai_usage: {
        by_task_and_status: {
          grade_writing: usageStatuses,
          grade_speaking: usageStatuses,
          generate: usageStatuses,
          analysis: usageStatuses,
          path: usageStatuses,
          suggest_comment: usageStatuses,
        },
        total_tokens: 0,
        today_by_status: usageStatuses,
      },
      reports: { by_status: { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0 } },
    });
  });

  it("ghép số đếm, cộng tokens và làm tròn điểm đã tổng hợp", () => {
    const result = buildAnalyticsOverview({
      ...emptyAggregates,
      users: [
        { role: "STUDENT", status: "ACTIVE", ...count(4) },
        { role: "TEACHER", status: "PENDING", ...count(1) },
      ],
      classCount: 2,
      assignmentCount: 5,
      openAssignmentCount: 3,
      exercises: [
        { status: "PUBLISHED", source: "ADMIN", inLibrary: true, ...count(3) },
        { status: "PUBLISHED", source: "TEACHER", inLibrary: false, ...count(2) },
        { status: "DRAFT", source: "TEACHER", inLibrary: false, ...count(1) },
      ],
      attempts: [
        { mode: "practice", isLate: false, ...count(5) },
        { mode: "exam", isLate: true, ...count(2) },
        { mode: "exam", isLate: false, ...count(1) },
      ],
      averageScores: [{ skill: "WRITING", average: 7.126 }],
      aiUsage: [
        { task: "grade_writing", status: "ok", ...count(2), _sum: { tokens: 31 } },
        { task: "grade_writing", status: "cached", ...count(1), _sum: { tokens: null } },
        { task: "generate", status: "ok", ...count(1), _sum: { tokens: 14 } },
      ],
      aiUsageToday: [
        { status: "cached", ...count(1) },
        { status: "rate_limited", ...count(2) },
      ],
      reports: [{ status: "OPEN", ...count(1) }],
    });

    expect(result.users.by_role_and_status.STUDENT.ACTIVE).toBe(4);
    expect(result.users.by_role_and_status.TEACHER.PENDING).toBe(1);
    expect(result.classes).toEqual({ total: 2 });
    expect(result.assignments).toEqual({ total: 5, open: 3 });
    expect(result.exercises).toEqual({
      by_status: { DRAFT: 1, PROPOSED: 0, PUBLISHED: 5, HIDDEN: 0 },
      by_source: { ADMIN: 3, TEACHER: 3, AI: 0 },
      in_library: 3,
    });
    expect(result.attempts).toMatchObject({
      total: 8,
      by_mode: { practice: 5, exam: 3 },
      is_late: 2,
      average_final_score_by_skill: { WRITING: 7.13, READING: 0 },
    });
    expect(result.ai_usage).toMatchObject({
      by_task_and_status: { grade_writing: { ok: 2, cached: 1 }, generate: { ok: 1 } },
      total_tokens: 45,
      today_by_status: { ok: 0, error: 0, cached: 1, rate_limited: 2 },
    });
    expect(result.reports.by_status).toEqual({ OPEN: 1, IN_PROGRESS: 0, RESOLVED: 0 });
  });
});