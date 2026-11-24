import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../config/prisma";
import {
  authorizationHeaders,
  createAuthorizationFixtures,
  startAuthorizationApp,
} from "./authorization-fixtures";

type Fixtures = Awaited<ReturnType<typeof createAuthorizationFixtures>>;
type Actor = keyof Fixtures["actors"];

let fixtures: Fixtures;
let app: Awaited<ReturnType<typeof startAuthorizationApp>>;

beforeAll(async () => {
  fixtures = await createAuthorizationFixtures();
  app = await startAuthorizationApp(fixtures.forbiddenValues);
});

afterAll(async () => {
  try {
    await app?.close();
  } finally {
    try {
      await fixtures?.cleanup();
    } finally {
      await prisma.$disconnect();
    }
  }
});

function request(path: string, method = "GET", actor?: Actor, body?: object) {
  return app.request(path, {
    method,
    headers: {
      ...(actor && authorizationHeaders(fixtures.actors[actor])),
      ...(body && { "Content-Type": "application/json" }),
    },
    body: body && JSON.stringify(body),
  });
}

function expectError(response: { status: number; body: unknown }, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.body).toMatchObject({ data: null, error: { code } });
}

const adminOnly = ["studentA", "teacherA"] as const;
const protectedRoutes = [
  ["GET", "/auth/me", []],
  ["GET", "/admin/users", adminOnly],
  ["GET", "/admin/users/:teacherId", adminOnly],
  ["PATCH", "/admin/users/:pendingId/approve", adminOnly],
  ["PATCH", "/admin/users/:teacherId/lock", adminOnly],
  ["PATCH", "/admin/users/:lockedId/unlock", adminOnly],
  ["GET", "/classes", []],
  ["GET", "/classes/:classId", []],
  ["POST", "/classes", ["studentA", "admin"]],
  ["POST", "/classes/join", ["teacherA", "admin"]],
  ["POST", "/classes/:classId/students", ["studentA"]],
  ["DELETE", "/classes/:classId/students/:studentId", ["studentA"]],
] satisfies [string, string, readonly Actor[]][];

function fixturePath(path: string) {
  const { actors, classes } = fixtures;
  return path
    .replace(":pendingId", String(actors.pendingTeacher.id))
    .replace(":teacherId", String(actors.teacherB.id))
    .replace(":lockedId", String(actors.lockedTeacher.id))
    .replace(":classId", String(classes.classA.id))
    .replace(":studentId", String(actors.studentA.id));
}

describe.each(protectedRoutes)("%s %s", (method, path, denied) => {
  it("thiếu token → 401", async () => {
    expectError(await request(fixturePath(path), method), 401, "UNAUTHORIZED");
  });

  it("token hỏng → 401", async () => {
    const response = await app.request(fixturePath(path), {
      method,
      headers: { Authorization: "Bearer invalid-jwt" },
    });
    expectError(response, 401, "INVALID_TOKEN");
  });

  it("token hết hạn → 401", async () => {
    const response = await app.request(fixturePath(path), {
      method,
      headers: authorizationHeaders(fixtures.actors.admin, -60),
    });
    expectError(response, 401, "INVALID_TOKEN");
  });

  it.each(["pendingTeacher", "lockedTeacher"] as const)("%s → 403", async (actor) => {
    expectError(await request(fixturePath(path), method, actor), 403, "FORBIDDEN");
  });

  for (const actor of denied) {
    it(`${actor} sai vai trò → 403 trước khi kiểm dữ liệu`, async () => {
      expectError(await request(fixturePath(path), method, actor), 403, "FORBIDDEN");
    });
  }
});

describe("auth", () => {
  it.each([
    ["STUDENT", "ACTIVE"],
    ["TEACHER", "PENDING"],
  ])("đăng ký %s trả trạng thái %s", async (role, status) => {
    const email = `t22-register-${randomUUID()}@example.test`;
    try {
      const response = await request("/auth/register", "POST", undefined, {
        name: "T22 Register",
        email,
        password: fixtures.password,
        role,
      });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ data: { email, role, status } });
    } finally {
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  it("từ chối đăng ký admin", async () => {
    const email = `t22-admin-register-${randomUUID()}@example.test`;
    try {
      const response = await request("/auth/register", "POST", undefined, {
        name: "T22 Register",
        email,
        password: fixtures.password,
        role: "ADMIN",
      });
      expectError(response, 400, "VALIDATION_ERROR");
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    } finally {
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  it.each(["studentA", "teacherA", "admin"] as const)("%s đăng nhập và /me trả đúng tài khoản", async (actor) => {
    const { id, email, role } = fixtures.actors[actor];
    const login = await request("/auth/login", "POST", undefined, { email, password: fixtures.password });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ data: { user: { id, email, role }, token: expect.any(String) } });

    const { data: { token } } = login.body as { data: { token: string } };
    const me = await app.request(`/auth/me?userId=${fixtures.actors.studentB.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ data: { id, email, role } });
  });

  it.each([
    ["pendingTeacher", 403, "ACCOUNT_PENDING"],
    ["lockedTeacher", 403, "ACCOUNT_LOCKED"],
    ["studentA", 401, "INVALID_CREDENTIALS"],
  ] as const)("đăng nhập thất bại với ca %s", async (actor, status, code) => {
    const { email } = fixtures.actors[actor];
    const password = actor === "studentA" ? `${fixtures.password}-wrong` : fixtures.password;
    expectError(await request("/auth/login", "POST", undefined, { email, password }), status, code);
  });
});

describe("admin", () => {
  it("lọc danh sách theo vai trò và trạng thái", async () => {
    const response = await request("/admin/users?role=TEACHER&status=PENDING", "GET", "admin");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: expect.arrayContaining([expect.objectContaining({
        id: fixtures.actors.pendingTeacher.id,
        role: "TEACHER",
        status: "PENDING",
      })]),
    });
  });

  it.each([
    ["approve", "pendingTeacher", "ACTIVE"],
    ["lock", "teacherB", "LOCKED"],
    ["unlock", "lockedTeacher", "ACTIVE"],
  ] as const)("admin %s đổi đúng trạng thái tài khoản %s", async (action, actor, targetStatus) => {
    const { id, status } = fixtures.actors[actor];
    try {
      const response = await request(`/admin/users/${id}/${action}`, "PATCH", "admin");
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ data: { id, status: targetStatus } });
      expect(await prisma.user.findUnique({ where: { id }, select: { status: true } }))
        .toEqual({ status: targetStatus });
    } finally {
      await prisma.user.update({ where: { id }, data: { status } });
    }
  });
});

describe("classes", () => {
  it.each(["studentA", "teacherA"] as const)("%s chỉ thấy lớp A", async (actor) => {
    const { classA, classB } = fixtures.classes;
    const list = await request("/classes", "GET", actor);
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ data: [{ id: classA.id }] });

    const detail = await request(`/classes/${classA.id}`, "GET", actor);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ data: { id: classA.id } });
    if (actor === "studentA") {
      expect(detail.body).not.toMatchObject({ data: { students: expect.anything() } });
      expect(detail.body).not.toMatchObject({ data: { code: expect.anything() } });
    }
    const denied = await request(`/classes/${classB.id}`, "GET", actor);
    expectError(denied, 404, "CLASS_NOT_FOUND");
    expect(denied).toEqual(await request("/classes/2147483647", "GET", actor));
  });

  it("admin xem danh sách và chi tiết cả hai lớp", async () => {
    const classes = Object.values(fixtures.classes);
    const list = await request("/classes", "GET", "admin");
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({
      data: expect.arrayContaining(classes.map(({ id }) => expect.objectContaining({ id }))),
    });
    for (const { id } of classes) {
      const detail = await request(`/classes/${id}`, "GET", "admin");
      expect(detail.status).toBe(200);
      expect(detail.body).toMatchObject({ data: { id } });
    }
  });

  it("GV tạo lớp với ID chủ lớp lấy từ tài khoản đăng nhập", async () => {
    const { teacherA, teacherB } = fixtures.actors;
    const name = `T22 Create ${randomUUID()}`;
    try {
      const response = await request("/classes", "POST", "teacherA", { name, teacherId: teacherB.id });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ data: { name, teacherId: teacherA.id } });
    } finally {
      await prisma.class.deleteMany({ where: { name, teacherId: { in: [teacherA.id, teacherB.id] } } });
    }
  });

  it("HS tham gia lớp bằng mã", async () => {
    const { id: studentId } = fixtures.actors.studentA;
    const { id: classId, code } = fixtures.classes.classB;
    const membership = { classId, studentId };
    try {
      const response = await request("/classes/join", "POST", "studentA", { code });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ data: { id: classId } });
      expect(await prisma.classMember.findUnique({ where: { classId_studentId: membership } })).not.toBeNull();
    } finally {
      await prisma.classMember.deleteMany({ where: membership });
    }
  });

  it("GV A bị từ chối thêm và xóa HS ở lớp B", async () => {
    const { studentA, studentB } = fixtures.actors;
    const { id: classId } = fixtures.classes.classB;
    const add = await request(`/classes/${classId}/students`, "POST", "teacherA", { email: studentA.email });
    const remove = await request(`/classes/${classId}/students/${studentB.id}`, "DELETE", "teacherA");
    expectError(add, 404, "CLASS_NOT_FOUND");
    expectError(remove, 404, "CLASS_NOT_FOUND");
    expect(await prisma.classMember.findUnique({ where: { classId_studentId: { classId, studentId: studentA.id } } }))
      .toBeNull();
    expect(await prisma.classMember.findUnique({ where: { classId_studentId: { classId, studentId: studentB.id } } }))
      .not.toBeNull();
  });

  it.each([
    ["teacherA", "classA", "studentB"],
    ["admin", "classA", "studentB"],
    ["admin", "classB", "studentA"],
  ] as const)("%s được thêm và xóa HS ở %s", async (actor, classroom, student) => {
    const { id: classId } = fixtures.classes[classroom];
    const { id: studentId, email } = fixtures.actors[student];
    const membership = { classId, studentId };
    const path = `/classes/${classId}/students`;
    try {
      const add = await request(path, "POST", actor, { email });
      expect(add.status).toBe(201);
      expect(add.body).toMatchObject({ data: { id: studentId } });
      expect(await prisma.classMember.findUnique({ where: { classId_studentId: membership } })).not.toBeNull();

      const remove = await request(`${path}/${studentId}`, "DELETE", actor);
      expect(remove.status).toBe(200);
      expect(remove.body).toMatchObject({ data: membership });
      expect(await prisma.classMember.findUnique({ where: { classId_studentId: membership } })).toBeNull();
    } finally {
      await prisma.classMember.deleteMany({ where: membership });
    }
  });
});