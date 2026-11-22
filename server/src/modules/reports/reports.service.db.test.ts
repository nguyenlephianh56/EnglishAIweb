import { ExerciseStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma";
import { createAuthorizationFixtures } from "../../testing/authorization-fixtures";
import { createReport, listReports, updateReport } from "./reports.service";

type Fixtures = Awaited<ReturnType<typeof createAuthorizationFixtures>>;
let fixtures: Fixtures;
const exerciseIds: number[] = [];
const missingId = 2_147_483_647;
const reason = "Đáp án câu 1 bị sai";

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error("Không kết nối được PostgreSQL. Kiểm tra DATABASE_URL trước khi chạy test báo lỗi.");
  }
  fixtures = await createAuthorizationFixtures();
});

afterAll(async () => {
  if (!fixtures) return;
  await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { userId: fixtures.actors.admin.id } }),
    prisma.assignment.deleteMany({ where: { exerciseId: { in: exerciseIds } } }),
    prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } }),
  ]);
  await fixtures.cleanup();
});

async function seedExercise(status: ExerciseStatus = "PUBLISHED", inLibrary = status === "PUBLISHED") {
  const exercise = await prisma.exercise.create({
    data: {
      type: "multiple_choice",
      skill: "READING",
      level: "A1",
      topic: "Test báo lỗi",
      content: { questions: [{ q: "Nội dung riêng", options: ["A", "B"] }] },
      answer: [0],
      status,
      source: "TEACHER",
      inLibrary,
      createdById: fixtures.actors.teacherA.id,
    },
    select: { id: true, type: true, skill: true, level: true, topic: true, status: true },
  });
  exerciseIds.push(exercise.id);
  return exercise;
}

function assignExercise(exerciseId: number, classroom: keyof Fixtures["classes"]) {
  const { id: classId, teacherId: assignedById } = fixtures.classes[classroom];
  return prisma.assignment.create({
    data: { exerciseId, classId, assignedById, dueAt: new Date("2030-01-01T00:00:00Z") },
    select: { id: true },
  });
}

function submit(exerciseId: number) {
  return createReport(fixtures.actors.studentA, { exercise_id: exerciseId, reason });
}

function auditFor(reportId: number) {
  return prisma.auditLog.findMany({
    where: { action: "report.update", detail: { path: ["report_id"], equals: reportId } },
    orderBy: { id: "asc" },
    select: { userId: true, detail: true },
  });
}

const duplicate = { statusCode: 409, code: "REPORT_ALREADY_OPEN" };
const invalidTransition = { statusCode: 409, code: "INVALID_STATUS_TRANSITION" };

describe("tạo báo lỗi bài tập", () => {
  it("tạo báo lỗi thư viện với người báo và trạng thái do server đặt", async () => {
    const exercise = await seedExercise();
    const report = await submit(exercise.id);

    expect(report).toEqual({
      id: expect.any(Number),
      status: "OPEN",
      reason,
      created_at: expect.any(Date),
      exercise,
      reporter: { id: fixtures.actors.studentA.id, name: "Student A" },
    });
    expect(await prisma.exerciseReport.findUnique({ where: { id: report.id } })).toMatchObject({
      exerciseId: exercise.id,
      reporterId: fixtures.actors.studentA.id,
      status: "OPEN",
    });
  });

  it("cho báo DRAFT được giao đúng lớp và dùng cùng 404 cho mọi bài ngoài quyền xem", async () => {
    const ownDraft = await seedExercise("DRAFT");
    const unassignedDraft = await seedExercise("DRAFT");
    const otherClassExercise = await seedExercise("PUBLISHED", false);
    const hidden = await seedExercise("HIDDEN");
    await assignExercise(ownDraft.id, "classA");
    await assignExercise(otherClassExercise.id, "classB");
    await assignExercise(hidden.id, "classA");

    await expect(submit(ownDraft.id)).resolves.toMatchObject({ status: "OPEN" });
    for (const id of [unassignedDraft.id, otherClassExercise.id, hidden.id, missingId]) {
      await expect(submit(id)).rejects.toMatchObject({
        statusCode: 404, code: "NOT_FOUND", message: "Không tìm thấy bài tập",
      });
    }
  });

  it("chặn báo lại khi OPEN hoặc IN_PROGRESS và cho báo lại sau RESOLVED", async () => {
    const { id: exerciseId } = await seedExercise();
    const { id: adminId } = fixtures.actors.admin;
    const first = await submit(exerciseId);
    await expect(submit(exerciseId)).rejects.toMatchObject(duplicate);
    await updateReport(adminId, first.id, { status: "IN_PROGRESS" });
    await expect(submit(exerciseId)).rejects.toMatchObject(duplicate);
    await updateReport(adminId, first.id, { status: "RESOLVED" });
    const reopened = await submit(exerciseId);
    expect(reopened.id).not.toBe(first.id);
    expect(reopened.status).toBe("OPEN");
    expect(await prisma.exerciseReport.count({ where: { exerciseId } })).toBe(2);
  });

  it("hai lần tạo song song cùng học sinh và bài chỉ lưu một dòng", async () => {
    const { id: exerciseId } = await seedExercise();
    const results = await Promise.allSettled([submit(exerciseId), submit(exerciseId)]);
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "fulfilled" }),
      expect.objectContaining({ status: "rejected", reason: expect.objectContaining(duplicate) }),
    ]));
    expect(await prisma.exerciseReport.count({ where: { exerciseId } })).toBe(1);
  });
});

describe("danh sách báo lỗi", () => {
  it("lọc trạng thái và bài, phân trang mới nhất trước và dùng id khi cùng thời điểm", async () => {
    const { id: exerciseId } = await seedExercise();
    const { id: otherId } = await seedExercise();
    const { studentA, studentB } = fixtures.actors;
    const newerAt = new Date("2026-11-22T10:00:00Z");
    const olderAt = new Date("2026-11-21T10:00:00Z");
    const add = (createdAt: Date, reporterId = studentA.id, status = "OPEN", reportExerciseId = exerciseId) =>
      prisma.exerciseReport.create({
        data: { exerciseId: reportExerciseId, reporterId, status, reason, createdAt },
        select: { id: true },
      });

    const newer = await add(newerAt);
    const older = await add(olderAt, studentA.id, "RESOLVED");
    const sameTime = await add(newerAt, studentB.id);
    await add(newerAt, studentA.id, "OPEN", otherId);

    const query = { exercise_id: exerciseId, limit: 1 };
    const first = await listReports(query);
    const second = await listReports({ ...query, cursor: first.next_cursor ?? undefined });
    const third = await listReports({ ...query, cursor: second.next_cursor ?? undefined });
    expect([first, second, third].map(({ items }) => items.map((item) => item.id)))
      .toEqual([[sameTime.id], [newer.id], [older.id]]);
    expect([first.next_cursor, second.next_cursor, third.next_cursor]).toEqual([sameTime.id, newer.id, null]);

    const filtered = await listReports({ status: "OPEN", exercise_id: exerciseId, limit: 50 });
    expect(filtered.items.map((item) => item.id)).toEqual([sameTime.id, newer.id]);
    expect(await listReports({ limit: 20, cursor: missingId })).toEqual({ items: [], next_cursor: null });
  });
});

describe("chuyển trạng thái báo lỗi", () => {
  it("chỉ ghi một audit cho mỗi chuyển hợp lệ và chặn chuyển sai", async () => {
    const { id: exerciseId } = await seedExercise();
    const { id: adminId } = fixtures.actors.admin;
    const { id } = await submit(exerciseId);

    await expect(updateReport(adminId, id, { status: "IN_PROGRESS" })).resolves.toMatchObject({ status: "IN_PROGRESS" });
    await expect(updateReport(adminId, id, { status: "IN_PROGRESS" })).rejects.toMatchObject(invalidTransition);
    await expect(updateReport(adminId, id, { status: "RESOLVED" })).resolves.toMatchObject({ status: "RESOLVED" });
    await expect(updateReport(adminId, id, { status: "IN_PROGRESS" })).rejects.toMatchObject(invalidTransition);
    await expect(updateReport(adminId, id, { status: "RESOLVED" })).rejects.toMatchObject(invalidTransition);
    expect(await auditFor(id)).toEqual([
      { userId: adminId, detail: { report_id: id, exercise_id: exerciseId, from: "OPEN", to: "IN_PROGRESS" } },
      { userId: adminId, detail: { report_id: id, exercise_id: exerciseId, from: "IN_PROGRESS", to: "RESOLVED" } },
    ]);
  });

  it("hai lần chuyển OPEN sang RESOLVED song song chỉ cập nhật và ghi audit một lần", async () => {
    const { id: exerciseId } = await seedExercise();
    const { id: adminId } = fixtures.actors.admin;
    const { id } = await submit(exerciseId);
    const resolve = () => updateReport(adminId, id, { status: "RESOLVED" });

    const results = await Promise.allSettled([resolve(), resolve()]);
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "fulfilled", value: expect.objectContaining({ status: "RESOLVED" }) }),
      expect.objectContaining({ status: "rejected", reason: expect.objectContaining(invalidTransition) }),
    ]));
    expect(await auditFor(id)).toEqual([
      { userId: adminId, detail: { report_id: id, exercise_id: exerciseId, from: "OPEN", to: "RESOLVED" } },
    ]);
  });

  it("trả 404 khi báo lỗi không tồn tại và rollback trạng thái khi ghi audit lỗi", async () => {
    const { id: exerciseId } = await seedExercise();
    const { id } = await submit(exerciseId);
    await expect(updateReport(fixtures.actors.admin.id, missingId, { status: "RESOLVED" }))
      .rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });

    await expect(updateReport(missingId, id, { status: "RESOLVED" })).rejects.toMatchObject({ code: "P2003" });
    expect(await prisma.exerciseReport.findUnique({ where: { id }, select: { status: true } })).toEqual({ status: "OPEN" });
    expect(await auditFor(id)).toEqual([]);
  });
});