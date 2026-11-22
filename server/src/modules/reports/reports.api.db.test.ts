import { randomUUID } from "node:crypto";
import type { ExerciseStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma";
import { authorizationHeaders, createAuthorizationFixtures, startAuthorizationApp } from "../../testing/authorization-fixtures";

type Fixtures = Awaited<ReturnType<typeof createAuthorizationFixtures>>;
type Actor = keyof Fixtures["actors"];
type Method = "POST" | "GET" | "PATCH";

let fixtures: Fixtures;
let app: Awaited<ReturnType<typeof startAuthorizationApp>>;
let deletedUserHeaders: ReturnType<typeof authorizationHeaders>;
const exerciseIds: number[] = [];
const missingId = 2_147_483_647;
const reason = "Đáp án câu 1 bị sai";
const privateContent = "Nội dung đề dùng riêng cho fixture báo lỗi";

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error("Không kết nối được PostgreSQL. Kiểm tra DATABASE_URL trước khi chạy test API báo lỗi.");
  }

  fixtures = await createAuthorizationFixtures();
  const deletedUser = await prisma.user.create({
    data: {
      name: "T26 Deleted User",
      email: `t26-report-deleted-${randomUUID()}@example.test`,
      passwordHash: "unused-in-this-test",
    },
    select: { id: true },
  });
  deletedUserHeaders = authorizationHeaders(deletedUser);
  await prisma.user.delete({ where: { id: deletedUser.id } });

  const emails = Object.values(fixtures.actors).map((actor) => actor.email);
  app = await startAuthorizationApp([...fixtures.forbiddenValues, ...emails, privateContent]);
});

afterAll(async () => {
  await app?.close();
  if (!fixtures) return;
  await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { userId: fixtures.actors.admin.id } }),
    prisma.assignment.deleteMany({ where: { exerciseId: { in: exerciseIds } } }),
    prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } }),
  ]);
  await fixtures.cleanup();
});

function request(method: Method, path = "", auth?: HeadersInit, body?: unknown) {
  const headers = new Headers(auth);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return app.request(`/reports${path}`, { method, headers, body: JSON.stringify(body) }, {
    forbiddenKeys: ["email", "answer", "content"],
  });
}

function asActor(actor: Actor, method: Method, path = "", body?: unknown) {
  return request(method, path, authorizationHeaders(fixtures.actors[actor]), body);
}

function submit(exerciseId: number, actor: Actor = "studentA") {
  return asActor(actor, "POST", "", { exercise_id: exerciseId, reason });
}

function expectedError(status: number, code: string, message = expect.any(String)) {
  return { status, body: { data: null, error: { code, message } } };
}

async function seedExercise(status: ExerciseStatus = "PUBLISHED", inLibrary = status === "PUBLISHED") {
  const exercise = await prisma.exercise.create({
    data: {
      type: "multiple_choice",
      skill: "READING",
      level: "A1",
      topic: "Test API báo lỗi",
      content: { questions: [{ q: privateContent, options: ["A", "B"] }] },
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

const protectedRoutes = [
  { method: "POST", path: "", denied: ["teacherA", "admin"] },
  { method: "GET", path: "", denied: ["studentA", "teacherA"] },
  { method: "PATCH", path: "/1", denied: ["studentA", "teacherA"] },
] as const;

describe.each(protectedRoutes)("quyền $method /api/v1/reports$path", ({ method, path, denied }) => {
  it("trả 401 khi thiếu token hoặc tài khoản đã bị xóa", async () => {
    const unauthorized = expectedError(401, "UNAUTHORIZED");
    expect(await request(method, path)).toEqual(unauthorized);
    expect(await request(method, path, deletedUserHeaders)).toEqual(unauthorized);
  });

  it("trả 401 khi token hết hạn hoặc sai chữ ký", async () => {
    const actor = method === "POST" ? fixtures.actors.studentA : fixtures.actors.admin;
    const invalidToken = expectedError(401, "INVALID_TOKEN");
    expect(await request(method, path, authorizationHeaders(actor, -60))).toEqual(invalidToken);
    const wrongKey = jwt.sign({ userId: actor.id }, randomUUID());
    expect(await request(method, path, { Authorization: `Bearer ${wrongKey}` })).toEqual(invalidToken);
  });

  it.each([...denied, "pendingTeacher", "lockedTeacher"] as const)("%s nhận 403", async (actor) => {
    expect(await asActor(actor, method, path)).toEqual(expectedError(403, "FORBIDDEN"));
  });
});

describe("hợp đồng API báo lỗi", () => {
  it("POST trả 201, chuẩn hóa reason và dùng thông tin người báo từ token", async () => {
    const exercise = await seedExercise();
    const response = await asActor("studentA", "POST", "", { exercise_id: exercise.id, reason: ` ${reason}\u0000 ` });
    const reporterId = fixtures.actors.studentA.id;
    const row = await prisma.exerciseReport.findFirstOrThrow({ where: { exerciseId: exercise.id, reporterId } });

    expect(response).toEqual({
      status: 201,
      body: { data: {
        id: row.id,
        status: "OPEN",
        reason,
        created_at: row.createdAt.toISOString(),
        exercise,
        reporter: { id: reporterId, name: "Student A" },
      }, error: null },
    });
    expect(row).toMatchObject({ reporterId, status: "OPEN", reason });
  });

  it("POST trả cùng status và body 404 khi bài ngoài quyền xem hoặc không tồn tại", async () => {
    const draft = await seedExercise("DRAFT");
    const hidden = await seedExercise("HIDDEN");
    const otherClass = await seedExercise("PUBLISHED", false);
    const room = fixtures.classes.classB;
    await prisma.assignment.create({
      data: { exerciseId: otherClass.id, classId: room.id, assignedById: room.teacherId, dueAt: new Date() },
    });

    const notFound = expectedError(404, "NOT_FOUND", "Không tìm thấy bài tập");
    for (const id of [draft.id, hidden.id, otherClass.id, missingId]) {
      expect(await submit(id)).toEqual(notFound);
    }
    expect(await asActor("admin", "PATCH", `/${missingId}`, { status: "RESOLVED" }))
      .toEqual(expectedError(404, "NOT_FOUND", "Không tìm thấy báo lỗi"));
  });

  it("trả 400 khi body, query hoặc id sai và chấp nhận reason đúng 1.000 ký tự", async () => {
    const { id: exercise_id } = await seedExercise();
    const validationError = expectedError(400, "VALIDATION_ERROR");
    for (const body of [
      { reason: "" }, { reason: "   " }, { reason: "a".repeat(1001) },
      { reason, reporter_id: 1 }, { reason, status: "OPEN" }, { reason, extra: true },
    ]) {
      expect(await asActor("studentA", "POST", "", { exercise_id, ...body })).toEqual(validationError);
    }
    expect((await asActor("studentA", "POST", "", { exercise_id, reason: "a".repeat(1000) })).status).toBe(201);

    for (const query of ["?limit=0", "?limit=51", "?status=open", "?exercise_id=abc"]) {
      expect(await asActor("admin", "GET", query)).toEqual(validationError);
    }
    expect(await asActor("admin", "PATCH", "/abc", { status: "RESOLVED" })).toEqual(validationError);
    expect(await asActor("admin", "PATCH", "/1", { status: "OPEN" })).toEqual(validationError);
    expect(await asActor("admin", "PATCH", "/1", { status: "RESOLVED", reason })).toEqual(validationError);
  });

  it("GET đọc bộ lọc và trả cursor của mục cuối trên trang", async () => {
    const { id: exerciseId } = await seedExercise();
    const first = await submit(exerciseId);
    const second = await submit(exerciseId, "studentB");
    const rows = await prisma.exerciseReport.findMany({
      where: { exerciseId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true },
    });
    const items = [first, second].map(({ body }) => (body as { data: { id: number } }).data);
    const newest = items.find((item) => item.id === rows[0].id);
    const oldest = items.find((item) => item.id === rows[1].id);
    const query = `?status=OPEN&exercise_id=${exerciseId}&limit=1`;

    expect(await asActor("admin", "GET", query)).toEqual({
      status: 200, body: { data: { items: [newest], next_cursor: rows[0].id }, error: null },
    });
    expect(await asActor("admin", "GET", `${query}&cursor=${rows[0].id}`)).toEqual({
      status: 200, body: { data: { items: [oldest], next_cursor: null }, error: null },
    });
    expect(await asActor("admin", "GET", `?status=RESOLVED&exercise_id=${exerciseId}&limit=50`)).toEqual({
      status: 200, body: { data: { items: [], next_cursor: null }, error: null },
    });
  });

  it("hai POST song song trả 201 và 409, hai PATCH cùng trạng thái đích trả 200 và 409", async () => {
    const { id: exerciseId } = await seedExercise();
    const posts = await Promise.all([submit(exerciseId), submit(exerciseId)]);
    expect(posts.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(posts.find(({ status }) => status === 409)).toEqual(expectedError(409, "REPORT_ALREADY_OPEN"));
    const rows = await prisma.exerciseReport.findMany({ where: { exerciseId }, select: { id: true, status: true } });
    expect(rows).toEqual([{ id: expect.any(Number), status: "OPEN" }]);

    const [{ id }] = rows;
    const patch = () => asActor("admin", "PATCH", `/${id}`, { status: "RESOLVED" });
    const patches = await Promise.all([patch(), patch()]);
    expect(patches.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(patches.find(({ status }) => status === 409)).toEqual(expectedError(409, "INVALID_STATUS_TRANSITION"));
    expect(patches.find(({ status }) => status === 200)?.body).toMatchObject({ data: { id, status: "RESOLVED" }, error: null });
    expect(await prisma.auditLog.findMany({
      where: { action: "report.update", detail: { path: ["report_id"], equals: id } },
      select: { userId: true, detail: true },
    })).toEqual([{
      userId: fixtures.actors.admin.id,
      detail: { report_id: id, exercise_id: exerciseId, from: "OPEN", to: "RESOLVED" },
    }]);
    expect((await submit(exerciseId)).status).toBe(201);
  });
});