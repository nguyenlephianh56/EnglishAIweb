import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { countAiUsageToday } from "../../ai/ai.usage";
import { env } from "../../config/env";
import { buildAnalyticsOverview } from "./analytics.overview";
import { getAnalyticsOverview } from "./analytics.service";

const now = new Date("2026-11-22T17:30:00.000Z");
const windowStart = new Date("2026-11-21T17:30:00.000Z");
const beforeWindow = new Date(windowStart.getTime() - 1);
const afterNow = new Date(now.getTime() + 1);
const todayStart = new Date("2026-11-22T17:00:00.000Z");
const beforeToday = new Date(todayStart.getTime() - 1);
const tomorrowStart = new Date("2026-11-23T17:00:00.000Z");

const url = new URL(env.DATABASE_URL);
const sourceSchema = url.searchParams.get("schema") ?? "public";
url.searchParams.set("schema", "pg_temp");

const db = new PrismaClient({ datasourceUrl: url.href, log: [{ emit: "event", level: "query" }] });
let selectCount = 0;
db.$on("query", ({ query }) => {
  if (/^\s*SELECT\b/i.test(query)) selectCount += 1;
});

beforeAll(async () => {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    throw new Error("Không kết nối được PostgreSQL. Kiểm tra DATABASE_URL trước khi chạy test thống kê.");
  }
});

afterAll(async () => {
  await db.$disconnect();
});

async function createTemporaryTables(tx: Prisma.TransactionClient) {
  const schema = Prisma.raw(`"${sourceSchema.replaceAll('"', '""')}"`);
  const tables = ["users", "classes", "assignments", "exercises", "attempts", "ai_usage_logs", "exercise_reports"];
  // Bảng tạm che bảng thật trên kết nối này và tự mất khi transaction kết thúc.
  for (const table of tables) {
    const identifier = Prisma.raw(`"${table}"`);
    await tx.$executeRaw`CREATE TEMP TABLE ${identifier} (LIKE ${schema}.${identifier} INCLUDING DEFAULTS) ON COMMIT DROP`;
  }
}

async function seedOverview(tx: Prisma.TransactionClient) {
  // Mỗi dòng dùng ID rõ ràng để fixture không tăng sequence của bảng gốc.
  await tx.$executeRaw`
    INSERT INTO users (id, name, email, password_hash, role, status) VALUES
      (1, 'Student A', 'student-a@example.test', 'private-hash', 'STUDENT', 'ACTIVE'),
      (2, 'Student B', 'student-b@example.test', 'private-hash', 'STUDENT', 'ACTIVE'),
      (3, 'Teacher A', 'teacher-a@example.test', 'private-hash', 'TEACHER', 'ACTIVE'),
      (4, 'Teacher B', 'teacher-b@example.test', 'private-hash', 'TEACHER', 'PENDING'),
      (5, 'Admin', 'admin@example.test', 'private-hash', 'ADMIN', 'ACTIVE')
  `;
  await tx.$executeRaw`
    INSERT INTO classes (id, name, code, teacher_id) VALUES
      (1, 'Class A', 'ABC001', 3), (2, 'Class B', 'ABC002', 3)
  `;
  await tx.$executeRaw`
    INSERT INTO exercises (id, type, skill, level, topic, content, status, source, in_library, created_by_id) VALUES
      (1, 'writing', 'WRITING', 'A1', 'Topic A', '{"prompt":"private-content"}', 'PUBLISHED', 'ADMIN', true, 5),
      (2, 'multiple_choice', 'READING', 'A1', 'Topic B', '{}', 'DRAFT', 'TEACHER', false, 3),
      (3, 'multiple_choice', 'READING', 'B1', 'Topic C', '{}', 'HIDDEN', 'AI', false, 3)
  `;
  await tx.$executeRaw`
    INSERT INTO assignments (id, exercise_id, class_id, assigned_by_id, due_at) VALUES
      (1, 1, 1, 3, ${afterNow}), (2, 1, 2, 3, ${now}), (3, 2, 1, 3, ${beforeWindow})
  `;
  await tx.$executeRaw`
    INSERT INTO attempts (id, student_id, exercise_id, mode, answer, score, teacher_score, is_late, submitted_at) VALUES
      (1, 1, 1, 'practice', '"private-answer"', 3, 9.25, false, ${windowStart}),
      (2, 1, 1, 'practice', '{}', 7.902, NULL, false, ${now}),
      (3, 1, 1, 'practice', '{}', NULL, NULL, false, ${now}),
      (4, 1, 1, 'exam', '{}', 5, 'NaN'::double precision, true, ${now}),
      (5, 1, 1, 'exam', '{}', 5, 11, true, ${now}),
      (6, 1, 1, 'exam', '{}', -0.1, NULL, false, ${now}),
      (7, 1, 2, 'exam', '{}', 0, NULL, false, ${now}),
      (8, 1, 3, 'exam', '{}', 10, NULL, false, ${now}),
      (9, 1, 1, 'practice', '{}', 0, NULL, false, ${beforeWindow}),
      (10, 1, 1, 'practice', '{}', 0, NULL, false, ${afterNow})
  `;
  await tx.$executeRaw`
    INSERT INTO ai_usage_logs (id, user_id, task, status, tokens, created_at) VALUES
      (1, 1, 'grade_writing', 'ok', 10, ${windowStart}),
      (2, 1, 'grade_writing', 'ok', 1000, ${beforeWindow}),
      (3, 1, 'generate', 'error', 3, ${beforeToday}),
      (4, 1, 'grade_writing', 'cached', NULL, ${todayStart}),
      (5, 1, 'grade_writing', 'ok', 4, ${now}),
      (6, 1, 'path', 'rate_limited', NULL, ${now}),
      (7, 1, 'path', 'error', 1000, ${tomorrowStart})
  `;
  await tx.$executeRaw`
    INSERT INTO exercise_reports (id, exercise_id, reporter_id, reason, status) VALUES
      (1, 1, 1, 'Report A', 'OPEN'), (2, 1, 2, 'Report B', 'IN_PROGRESS'), (3, 2, 1, 'Report C', 'RESOLVED')
  `;
}

describe("thống kê overview trên PostgreSQL", () => {
  it("trả toàn số 0 khi bảng rỗng, tổng hợp đúng fixture và dùng số truy vấn cố định", async () => {
    await db.$transaction(async (tx) => {
      await createTemporaryTables(tx);

      const beforeEmpty = selectCount;
      const empty = await getAnalyticsOverview({ days: 1 }, now, tx);
      const emptyQueryCount = selectCount - beforeEmpty;
      expect(empty).toEqual(buildAnalyticsOverview({
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
      }));
      expect(emptyQueryCount).toBe(10);

      await seedOverview(tx);
      const beforeFilled = selectCount;
      const overview = await getAnalyticsOverview({ days: 1 }, now, tx);
      expect(selectCount - beforeFilled).toBe(emptyQueryCount);

      expect(overview.users.by_role_and_status).toEqual({
        STUDENT: { PENDING: 0, ACTIVE: 2, LOCKED: 0 },
        TEACHER: { PENDING: 1, ACTIVE: 1, LOCKED: 0 },
        ADMIN: { PENDING: 0, ACTIVE: 1, LOCKED: 0 },
      });
      expect(overview.classes).toEqual({ total: 2 });
      expect(overview.assignments).toEqual({ total: 3, open: 1 });
      expect(overview.exercises).toEqual({
        by_status: { DRAFT: 1, PROPOSED: 0, PUBLISHED: 1, HIDDEN: 1 },
        by_source: { ADMIN: 1, TEACHER: 1, AI: 1 },
        in_library: 1,
      });
      expect(overview.attempts).toEqual({
        total: 8,
        by_mode: { practice: 3, exam: 5 },
        is_late: 2,
        average_final_score_by_skill: { LISTENING: 0, SPEAKING: 0, READING: 5, WRITING: 8.58, FOUNDATION: 0 },
      });
      expect(overview.ai_usage).toMatchObject({
        by_task_and_status: {
          grade_writing: { ok: 2, cached: 1 },
          generate: { error: 1 },
          path: { error: 0, rate_limited: 1 },
        },
        total_tokens: 17,
        today_by_status: { ok: 1, error: 0, cached: 1, rate_limited: 1 },
      });
      expect(await countAiUsageToday(1, now, tx)).toBe(1);
      expect(overview.reports.by_status).toEqual({ OPEN: 1, IN_PROGRESS: 1, RESOLVED: 1 });
      expect(JSON.stringify(overview)).not.toMatch(/email|passwordHash|private-hash|private-content|private-answer/i);
    }, { timeout: 15_000 });
  });
});