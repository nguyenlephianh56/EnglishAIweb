import { randomUUID } from "node:crypto";
import type { Assignment, UserStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../config/prisma";
import { createAuthorizationFixtures } from "../../testing/authorization-fixtures";
import { MAX_REMIND_HOURS } from "../assignments/assignments.constants";
import { REMINDER_DAY_MS, REMINDER_HOUR_MS } from "./notifications.constants";
import * as reminderRules from "./notifications.reminder-rules";
import { runReminderScan } from "./notifications.reminder";

vi.mock("../../config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config/env")>();
  return { ...actual, env: { ...actual.env, APP_TIMEZONE: "Asia/Tokyo" } };
});

const now = new Date("2090-11-22T16:49:05.000Z");
const dueAt = new Date("2090-11-22T17:30:00.000Z");
const hoursFromNow = (hours: number) => new Date(now.getTime() + hours * REMINDER_HOUR_MS);

let fixtures: Awaited<ReturnType<typeof createAuthorizationFixtures>>;
let exerciseId: number;
let hiddenExerciseId: number;
let peerId: number;
let submittedId: number;
let pendingId: number;
let lockedId: number;
const extraUserIds: number[] = [];
const exerciseIds: number[] = [];

const userIds = () => [...Object.values(fixtures.actors).map(({ id }) => id), ...extraUserIds];

async function createStudent(status: UserStatus) {
  const { id } = await prisma.user.create({
    data: {
      name: "Học sinh test nhắc hạn",
      email: `t25-reminder-${randomUUID()}@example.test`,
      passwordHash: "t25-test-fixture",
      role: "STUDENT",
      status,
    },
    select: { id: true },
  });
  extraUserIds.push(id);
  return id;
}

const addMembers = (...studentIds: number[]) => prisma.classMember.createMany({
  data: studentIds.map((studentId) => ({ classId: fixtures.classes.classA.id, studentId })),
});

const assign = (remindBeforeH: number[], overrides: Partial<Pick<Assignment, "dueAt" | "createdAt" | "exerciseId">> = {}) =>
  prisma.assignment.create({
    data: {
      classId: fixtures.classes.classA.id,
      assignedById: fixtures.actors.teacherA.id,
      exerciseId,
      dueAt,
      remindBeforeH,
      createdAt: new Date(now.getTime() - 8 * REMINDER_DAY_MS),
      ...overrides,
    },
  });

const submit = (studentId: number, assignmentId: number | null, submittedAt = now) =>
  prisma.attempt.create({ data: { studentId, assignmentId, exerciseId, submittedAt, answer: {} } });

const notifications = () => prisma.notification.findMany({
  where: { userId: { in: userIds() } },
  select: { userId: true, type: true, message: true },
  orderBy: [{ type: "asc" }, { userId: "asc" }],
});
const recipients = async () => (await notifications()).map(({ userId, type }) => ({ userId, type }));

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error("Không kết nối được PostgreSQL. Kiểm tra DATABASE_URL trước khi chạy test quét nhắc hạn.");
  }

  fixtures = await createAuthorizationFixtures();
  await prisma.class.update({
    where: { id: fixtures.classes.classA.id },
    data: { name: "<i>9A</i>\n" },
  });
  for (const status of ["PUBLISHED", "HIDDEN"] as const) {
    const { id } = await prisma.exercise.create({
      data: {
        type: "multiple_choice", skill: "READING", level: "A1", source: "TEACHER", status,
        topic: "<b>Ôn từ vựng</b>\n\u001f soan.bai@example.test",
        createdById: fixtures.actors.teacherA.id, content: {}, answer: { correct: "a" },
      },
      select: { id: true },
    });
    exerciseIds.push(id);
  }
  [exerciseId, hiddenExerciseId] = exerciseIds;
  [peerId, submittedId, pendingId, lockedId] = await Promise.all([
    createStudent("ACTIVE"), createStudent("ACTIVE"), createStudent("PENDING"), createStudent("LOCKED"),
  ]);
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (!fixtures) return;

  const classId = fixtures.classes.classA.id;
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { userId: { in: userIds() } } }),
    prisma.attempt.deleteMany({ where: { exerciseId: { in: exerciseIds } } }),
    prisma.assignment.deleteMany({ where: { classId } }),
    prisma.classMember.deleteMany({ where: { classId, studentId: { not: fixtures.actors.studentA.id } } }),
  ]);
});

afterAll(async () => {
  await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
  await fixtures?.cleanup();
  await prisma.user.deleteMany({ where: { id: { in: extraUserIds } } });
});

describe("runReminderScan", () => {
  it("lọc cửa sổ, mốc nhắc, bài HIDDEN và người nhận ngay khi quét DB", async () => {
    const { studentA, teacherA } = fixtures.actors;
    await addMembers(submittedId, pendingId, lockedId, teacherA.id);
    const assignment = await assign([4]);
    await submit(submittedId, assignment.id);
    await submit(studentA.id, null); // Tự luyện cùng bài tập vẫn được nhắc về bài giao.
    await Promise.all([
      assign([4], { exerciseId: hiddenExerciseId }),
      assign([]),
      assign([4], { dueAt: now }),
      assign([4], { dueAt: hoursFromNow(-1) }),
      assign([MAX_REMIND_HOURS], { dueAt: new Date(hoursFromNow(MAX_REMIND_HOURS).getTime() + 1) }),
      assign([1], { dueAt: hoursFromNow(3) }),
      assign([4], { createdAt: hoursFromNow(-0.5) }),
    ]);

    expect(await runReminderScan({ now })).toEqual({ scanned: 3, created: 1, failed: 0 });
    expect(await notifications()).toEqual([{
      userId: studentA.id,
      type: `deadline:${assignment.id}:4`,
      message: "Bài giao «Ôn từ vựng» của lớp 9A sắp đến hạn nộp (23/11/2090 02:30), còn khoảng 41 phút.",
    }]);
  });

  it("nhận bài đúng biên trên của cửa sổ quét", async () => {
    const mark = MAX_REMIND_HOURS;
    const assignment = await assign([mark], { dueAt: hoursFromNow(mark) });
    expect(await runReminderScan({ now })).toEqual({ scanned: 1, created: 1, failed: 0 });
    expect(await recipients()).toEqual([{ userId: fixtures.actors.studentA.id, type: `deadline:${assignment.id}:${mark}` }]);
  });

  it("cùng mốc giữ nguyên thông báo, mốc sát hạn hơn bỏ qua HS vừa nộp", async () => {
    const { id: studentId } = fixtures.actors.studentA;
    await addMembers(peerId);
    const assignment = await assign([4, 2], { dueAt: hoursFromNow(4) });
    const firstType = `deadline:${assignment.id}:4`;
    const secondType = `deadline:${assignment.id}:2`;

    expect(await runReminderScan({ now })).toEqual({ scanned: 1, created: 2, failed: 0 });
    await prisma.notification.updateMany({ where: { userId: studentId, type: firstType }, data: { readAt: now } });
    expect(await runReminderScan({ now })).toEqual({ scanned: 1, created: 0, failed: 0 });
    expect(await runReminderScan({ now: hoursFromNow(0.5) })).toEqual({ scanned: 1, created: 0, failed: 0 });

    await submit(studentId, assignment.id, hoursFromNow(1));
    expect(await runReminderScan({ now: hoursFromNow(2) })).toEqual({ scanned: 1, created: 1, failed: 0 });
    expect(await recipients()).toEqual([
      { userId: peerId, type: secondType },
      { userId: studentId, type: firstType },
      { userId: peerId, type: firstType },
    ]);
  });

  it("chỉ ghi cho người còn thiếu nếu một HS đã có thông báo cùng khóa", async () => {
    const { id: studentId } = fixtures.actors.studentA;
    await addMembers(peerId);
    const assignment = await assign([4]);
    const type = `deadline:${assignment.id}:4`;
    await prisma.notification.create({ data: { userId: studentId, type, message: "Đã nhắc trước", readAt: now } });

    expect(await runReminderScan({ now })).toEqual({ scanned: 1, created: 1, failed: 0 });
    expect(await recipients()).toEqual([{ userId: studentId, type }, { userId: peerId, type }]);
  });

  it("hai lượt quét song song chỉ tạo một dòng cho mỗi HS và mốc", async () => {
    const { id: studentId } = fixtures.actors.studentA;
    await addMembers(peerId);
    const assignment = await assign([4]);
    const type = `deadline:${assignment.id}:4`;

    const results = await Promise.all([runReminderScan({ now }), runReminderScan({ now })]);
    expect(results.map(({ created }) => created).sort((a, b) => a - b)).toEqual([0, 2]);
    expect(results.map(({ failed }) => failed)).toEqual([0, 0]);
    expect(await recipients()).toEqual([{ userId: studentId, type }, { userId: peerId, type }]);
  });

  it("lỗi một bài chỉ log mã, các bài khác vẫn tiếp tục và lỗi có thể quét lại", async () => {
    await assign([4]);
    const good = await assign([4]);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(reminderRules, "buildDeadlineMessage").mockImplementationOnce(() => {
      throw new Error("Nội dung giả cần giữ kín");
    });

    expect(await runReminderScan({ now })).toEqual({ scanned: 2, created: 1, failed: 1 });
    expect(await recipients()).toEqual([{ userId: fixtures.actors.studentA.id, type: `deadline:${good.id}:4` }]);
    expect(log.mock.calls).toEqual([["REMINDER_SCAN_FAILED"]]);
    expect(await runReminderScan({ now })).toEqual({ scanned: 2, created: 1, failed: 0 });
  });
});