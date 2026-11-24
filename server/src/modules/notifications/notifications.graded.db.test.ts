import { randomUUID } from "node:crypto";
import type { UserStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma";
import { createAuthorizationFixtures } from "../../testing/authorization-fixtures";
import { gradedNotificationKey } from "./notifications.constants";
import { createGradedNotification } from "./notifications.graded.service";

let fixtures: Awaited<ReturnType<typeof createAuthorizationFixtures>>;
let exerciseId: number;
let assignmentId: number;
const extraUserIds: number[] = [];
const exerciseIds: number[] = [];
const attemptIds: number[] = [];

const className = "T22 Class A"; // tên lớp của classA trong authorization-fixtures
const topic = `T28 graded ${randomUUID()}`;

async function createStudent(status: UserStatus) {
  const { id } = await prisma.user.create({
    data: {
      name: "Học sinh test graded",
      email: `t28-graded-${randomUUID()}@example.test`,
      passwordHash: "t28-test-fixture",
      role: "STUDENT",
      status,
    },
    select: { id: true },
  });
  extraUserIds.push(id);
  return id;
}

async function createAttempt(studentId: number, targetExerciseId = exerciseId) {
  const { id } = await prisma.attempt.create({
    data: { studentId, exerciseId: targetExerciseId, assignmentId, answer: { text: "Hello." }, score: null },
    select: { id: true },
  });
  attemptIds.push(id);
  return id;
}

// Không lọc theo user để bắt cả trường hợp thông báo bị gửi nhầm cho người khác.
const rowsOf = (attemptId: number) => prisma.notification.findMany({
  where: { type: gradedNotificationKey(attemptId) },
  orderBy: { id: "asc" },
});

async function createExercise(exerciseTopic: string) {
  const { id } = await prisma.exercise.create({
    data: {
      type: "writing",
      skill: "WRITING",
      level: "A1",
      topic: exerciseTopic,
      content: { prompt: "Write a sentence." },
      source: "TEACHER",
      createdById: fixtures.actors.teacherA.id,
    },
    select: { id: true },
  });
  exerciseIds.push(id);
  return id;
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error("Không kết nối được PostgreSQL. Kiểm tra DATABASE_URL trước khi chạy test graded.");
  }

  fixtures = await createAuthorizationFixtures();
  exerciseId = await createExercise(topic);
  assignmentId = (await prisma.assignment.create({
    data: {
      classId: fixtures.classes.classA.id,
      assignedById: fixtures.actors.teacherA.id,
      exerciseId,
      dueAt: new Date(Date.now() + 3_600_000),
    },
    select: { id: true },
  })).id;
});

afterAll(async () => {
  const studentIds = [fixtures?.actors.studentA.id, fixtures?.actors.studentB.id, ...extraUserIds]
    .filter((id): id is number => id !== undefined);
  await prisma.attempt.deleteMany({ where: { id: { in: attemptIds } } });
  await prisma.assignment.deleteMany({ where: { exerciseId: { in: exerciseIds } } });
  await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: studentIds } } });
  await fixtures?.cleanup();
  await prisma.user.deleteMany({ where: { id: { in: extraUserIds } } });
});

describe("createGradedNotification", () => {
  it("đúng 1 dòng cho đúng HS, type graded:<attemptId>, chưa đọc, message không có điểm/nhận xét", async () => {
    const attemptId = await createAttempt(fixtures.actors.studentA.id);

    expect(await createGradedNotification({ attemptId, studentId: fixtures.actors.studentA.id })).toBe(true);

    const rows = await rowsOf(attemptId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: fixtures.actors.studentA.id,
      type: `graded:${attemptId}`,
      message: `Giáo viên đã chấm bài «${topic}» của lớp ${className}.`,
      readAt: null,
    });
    expect(rows[0].createdAt).toBeInstanceOf(Date);
    // HS khác, GV và ADMIN không có thông báo này.
    expect(await prisma.notification.count({
      where: {
        userId: { in: [fixtures.actors.studentB.id, fixtures.actors.teacherA.id, fixtures.actors.admin.id] },
        type: gradedNotificationKey(attemptId),
      },
    })).toBe(0);
  });

  it("HS LOCKED hoặc PENDING thì bỏ qua, không báo lỗi", async () => {
    for (const status of ["LOCKED", "PENDING"] as const) {
      const studentId = await createStudent(status);
      const attemptId = await createAttempt(studentId);

      expect(await createGradedNotification({ attemptId, studentId })).toBe(false);
      expect(await rowsOf(attemptId)).toHaveLength(0);
    }
  });

  it("người nhận không phải STUDENT (GV, ADMIN) thì không tạo", async () => {
    const attemptId = await createAttempt(fixtures.actors.studentA.id);

    for (const actor of [fixtures.actors.teacherA, fixtures.actors.admin]) {
      expect(await createGradedNotification({ attemptId, studentId: actor.id })).toBe(false);
    }
    expect(await rowsOf(attemptId)).toHaveLength(0);
  });

  it("studentId không phải người nộp bài hoặc bài không tồn tại thì không tạo", async () => {
    const attemptId = await createAttempt(fixtures.actors.studentA.id);

    expect(await createGradedNotification({ attemptId, studentId: fixtures.actors.studentB.id })).toBe(false);
    expect(await createGradedNotification({
      attemptId: 2_147_483_647, studentId: fixtures.actors.studentA.id,
    })).toBe(false);
    expect(await rowsOf(attemptId)).toHaveLength(0);
    expect(await rowsOf(2_147_483_647)).toHaveLength(0);
  });

  it("làm sạch topic (HTML, email, xuống dòng) và không ghi audit_logs", async () => {
    const dirtyId = await createExercise("<b>Unit</b>\nliên hệ a.b@example.com");
    const attemptId = await createAttempt(fixtures.actors.studentA.id, dirtyId);
    const auditBefore = await prisma.auditLog.count({ where: { userId: fixtures.actors.studentA.id } });

    await createGradedNotification({ attemptId, studentId: fixtures.actors.studentA.id });

    const [row] = await rowsOf(attemptId);
    expect(row.message).toBe(`Giáo viên đã chấm bài «Unit liên hệ» của lớp ${className}.`);
    expect(await prisma.auditLog.count({ where: { userId: fixtures.actors.studentA.id } })).toBe(auditBefore);
  });

    it("graded chưa đọc: giữ cùng dòng và message, chỉ làm mới created_at", async () => {
    const attemptId = await createAttempt(fixtures.actors.studentA.id);
    const input = { attemptId, studentId: fixtures.actors.studentA.id };

    await createGradedNotification(input);
    const [first] = await rowsOf(attemptId);
    const oldTime = new Date("2000-01-01T00:00:00Z");
    const message = "Giáo viên đã chấm bài «Tên cũ» của lớp T22 Class A.";
    await prisma.notification.update({
      where: { id: first.id },
      data: { message, createdAt: oldTime },
    });

    await createGradedNotification(input);

    const rows = await rowsOf(attemptId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: first.id, message, readAt: null });
    expect(rows[0].createdAt.getTime()).toBeGreaterThan(oldTime.getTime());
  });
});