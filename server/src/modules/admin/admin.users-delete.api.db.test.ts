import { randomUUID } from "node:crypto";
import { Role, UserStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../config/prisma";
import { authorizationHeaders, startAuthorizationApp } from "../../testing/authorization-fixtures";
import * as deletion from "./admin.users-delete.service";
import { createUpdateKit } from "./admin.users-update.db-fixture";

const kit = createUpdateKit();
const json = { "Content-Type": "application/json" };
const missingId = 2_147_483_647;
const exerciseIds: number[] = [];
const classIds: number[] = [];
const auditActorIds: number[] = [];
const aiUserIds: number[] = [];
const registeredEmails: string[] = [];
let app: Awaited<ReturnType<typeof startAuthorizationApp>>;
let adminId: number;
let adminHeaders: ReturnType<typeof authorizationHeaders>;
let exerciseId: number;
let classId: number;

async function makeExercise(createdById: number, source: "ADMIN" | "TEACHER") {
  const exercise = await prisma.exercise.create({
    data: {
      type: "fill_blank",
      skill: "FOUNDATION",
      level: "A1",
      topic: "Bài test HTTP DELETE T29",
      content: { text: "She ___ to school." },
      answer: ["goes"],
      status: "PUBLISHED",
      inLibrary: true,
      source,
      createdById,
    },
  });
  exerciseIds.push(exercise.id);
  return exercise;
}

async function makeClass(teacherId: number) {
  const classroom = await prisma.class.create({
    data: {
      name: "Lớp HTTP DELETE T29",
      code: randomUUID().slice(0, 6).toUpperCase(),
      teacherId,
    },
  });
  classIds.push(classroom.id);
  return classroom;
}

beforeAll(async () => {
  const admin = await kit.makeUser("http-delete-admin", { role: Role.ADMIN });
  const teacher = await kit.makeUser("http-delete-teacher", { role: Role.TEACHER });
  adminId = admin.id;
  adminHeaders = authorizationHeaders(admin);
  auditActorIds.push(admin.id);
  exerciseId = (await makeExercise(admin.id, "ADMIN")).id;
  classId = (await makeClass(teacher.id)).id;
  app = await startAuthorizationApp([kit.password]);
});

afterAll(async () => {
  await app?.close();
  const exerciseFilter = { exerciseId: { in: exerciseIds } };
  await prisma.attempt.deleteMany({ where: exerciseFilter });
  await prisma.exerciseReport.deleteMany({ where: exerciseFilter });
  await prisma.assignment.deleteMany({ where: exerciseFilter });
  await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
  await prisma.aiUsageLog.deleteMany({ where: { userId: { in: aiUserIds } } });
  await prisma.user.deleteMany({ where: { email: { in: registeredEmails } } });
  await kit.cleanup(auditActorIds);
});

function remove(id: number | string, headers: Record<string, string> = adminHeaders, forbiddenValues?: string[]) {
  return app.request(`/admin/users/${id}`, { method: "DELETE", headers }, { forbiddenValues });
}

function post(path: string, body: object, headers?: Record<string, string>) {
  return app.request(path, { method: "POST", headers: { ...headers, ...json }, body: JSON.stringify(body) });
}

async function registerOldEmail(email: string) {
  const response = await post("/auth/register", { name: "Đăng ký lại T29", email, password: kit.password, role: Role.STUDENT });
  if (response.status === 201) registeredEmails.push(email);
  expect(response.status).toBe(201);
}

function expectError(response: { status: number; body: unknown }, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.body).toMatchObject({ data: null, error: { code } });
}

function audits(id: number) {
  return prisma.auditLog.findMany({
    where: { userId: adminId, detail: { path: ["target_user_id"], equals: id } },
    select: { userId: true, action: true, detail: true },
  });
}

async function retained<Row>(create: Promise<Row>, read: (row: Row) => Promise<Row | null>) {
  const row = await create;
  return async () => expect(await read(row)).toEqual(row);
}

const histories: { label: string; role?: Role; seed: (id: number) => Promise<() => Promise<void>> }[] = [
  { label: "lớp GV dạy", role: Role.TEACHER, seed: (id) => retained(makeClass(id), ({ id }) => prisma.class.findUnique({ where: { id } })) },
  { label: "thành viên lớp", seed: (studentId) => retained(
    prisma.classMember.create({ data: { classId, studentId } }),
    () => prisma.classMember.findUnique({ where: { classId_studentId: { classId, studentId } } })
  ) },
  { label: "bài GV tạo", role: Role.TEACHER, seed: (id) => retained(
    makeExercise(id, "TEACHER"), ({ id }) => prisma.exercise.findUnique({ where: { id } })
  ) },
  { label: "bài GV giao", role: Role.TEACHER, seed: (assignedById) => retained(
    prisma.assignment.create({ data: { classId, exerciseId, assignedById, dueAt: new Date("2030-01-01T00:00:00Z") } }),
    ({ id }) => prisma.assignment.findUnique({ where: { id } })
  ) },
  { label: "bài nộp", seed: (studentId) => retained(
    prisma.attempt.create({ data: { studentId, exerciseId, answer: ["goes"] } }),
    ({ id }) => prisma.attempt.findUnique({ where: { id } })
  ) },
  { label: "hồ sơ kỹ năng", seed: (studentId) => retained(
    prisma.skillProfile.create({ data: { studentId, skill: "FOUNDATION", score: 6 } }),
    ({ id }) => prisma.skillProfile.findUnique({ where: { id } })
  ) },
  { label: "lộ trình", seed: (studentId) => retained(
    prisma.learningPath.create({ data: { studentId, weekStart: new Date("2026-11-23T00:00:00Z") } }),
    ({ id }) => prisma.learningPath.findUnique({ where: { id } })
  ) },
  { label: "thông báo", seed: (userId) => retained(
    prisma.notification.create({ data: { userId, type: "system", message: "Thông báo test T29" } }),
    ({ id }) => prisma.notification.findUnique({ where: { id } })
  ) },
  { label: "báo lỗi bài", seed: (reporterId) => retained(
    prisma.exerciseReport.create({ data: { reporterId, exerciseId, reason: "Báo lỗi test T29" } }),
    ({ id }) => prisma.exerciseReport.findUnique({ where: { id } })
  ) },
  { label: "nhật ký AI", seed: (userId) => {
    aiUserIds.push(userId);
    return retained(prisma.aiUsageLog.create({ data: { userId, task: "analysis", status: "ok" } }),
      ({ id }) => prisma.aiUsageLog.findUnique({ where: { id } }));
  } },
  { label: "audit đã thực hiện", seed: (userId) => {
    auditActorIds.push(userId);
    return retained(prisma.auditLog.create({ data: { userId, action: "t29.test" } }),
      ({ id }) => prisma.auditLog.findUnique({ where: { id } }));
  } },
];

describe("DELETE /api/v1/admin/users/:id", () => {
  it("chặn theo token, vai trò, trạng thái và kiểm tra định dạng yêu cầu", async () => {
    expectError(await remove(missingId, {}), 401, "UNAUTHORIZED");
    expectError(await remove(missingId, { Authorization: "Bearer hong.token.abc" }), 401, "INVALID_TOKEN");
    for (const options of [{ role: Role.STUDENT }, { role: Role.TEACHER },
      { role: Role.ADMIN, status: UserStatus.LOCKED }, { role: Role.ADMIN, status: UserStatus.PENDING }]) {
      const actor = await kit.makeUser("http-delete-forbidden", options);
      expectError(await remove(missingId, authorizationHeaders(actor)), 403, "FORBIDDEN");
    }
    expectError(await remove("abc"), 400, "VALIDATION_ERROR");
    for (const body of [{}, { mode: "deleted" }]) {
      const response = await app.request(`/admin/users/${missingId}`, {
        method: "DELETE", headers: { ...adminHeaders, ...json }, body: JSON.stringify(body),
      });
      expectError(response, 400, "VALIDATION_ERROR");
    }
  });

  it("chặn tự xóa và xóa ADMIN, dùng cùng 404 với route khóa tài khoản", async () => {
    const other = await kit.makeUser("http-delete-other-admin", { role: Role.ADMIN });
    expectError(await remove(adminId), 409, "CANNOT_DELETE_SELF");
    const response = await remove(other.id);
    expectError(response, 409, "CANNOT_DELETE_ADMIN");
    expect(response.body).toMatchObject({ error: { message: "Phải thu hồi quyền admin trước khi xóa tài khoản này" } });
    const lock = await app.request(`/admin/users/${missingId}/lock`, { method: "PATCH", headers: adminHeaders });
    expect(await remove(missingId)).toEqual(lock);
    expect(lock.status).toBe(404);
  });

  it.each([{ role: Role.STUDENT }, { role: Role.TEACHER, status: UserStatus.PENDING }])(
    "xóa cứng tài khoản $role chưa dùng, vô hiệu token và trả lại email", async (options) => {
      const target = await kit.makeUser("http-delete-empty", options);
      const headers = authorizationHeaders(target);
      expect(await remove(target.id, adminHeaders, [target.name, target.email])).toEqual({
        status: 200, body: { data: { id: target.id, mode: "deleted" } },
      });
      expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
      expectError(await app.request("/attempts", { headers }), 401, "UNAUTHORIZED");
      expectError(await remove(target.id), 404, "USER_NOT_FOUND");
      await registerOldEmail(target.email);
      expect(await audits(target.id)).toEqual([
        { userId: adminId, action: "user.delete", detail: { target_user_id: target.id, role: target.role } },
      ]);
    }
  );

  it.each(histories)("ẩn danh và giữ nguyên lịch sử $label", async ({ role, seed }) => {
    const target = await kit.makeUser("http-delete-history", { role });
    const checkHistory = await seed(target.id);
    const alias = `deleted-${target.id}@deleted.invalid`;
    const headers = authorizationHeaders(target);
    expect(await remove(target.id, adminHeaders, [target.name, target.email, alias, "Người dùng đã xóa"])).toEqual({
      status: 200, body: { data: { id: target.id, mode: "anonymized" } },
    });
    expect(await kit.snapshot(target.id)).toMatchObject({
      name: "Người dùng đã xóa", email: alias, role: target.role, status: UserStatus.LOCKED,
    });
    await checkHistory();
    const oldToken = await app.request("/attempts", { headers });
    expectError(oldToken, 403, "FORBIDDEN");
    expect(oldToken.body).toMatchObject({ error: { message: "Tài khoản không tồn tại hoặc chưa được kích hoạt" } });
    expect((await post("/auth/login", { email: alias, password: kit.password })).status).toBe(401);
    await registerOldEmail(target.email);
    expectError(await remove(target.id), 409, "USER_ALREADY_ANONYMIZED");
    expect(await audits(target.id)).toEqual([
      { userId: adminId, action: "user.anonymize", detail: { target_user_id: target.id, role: target.role } },
    ]);
  });

  it.each([false, true])("hai yêu cầu DELETE cùng đích chỉ ghi một audit (có lịch sử %s)", async (withHistory) => {
    const target = await kit.makeUser("http-delete-parallel");
    if (withHistory) {
      await prisma.notification.create({ data: { userId: target.id, type: "system", message: "Test song song" } });
    }
    const results = await Promise.all([remove(target.id), remove(target.id)]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, withHistory ? 409 : 404]);
    const mode = withHistory ? "anonymized" : "deleted";
    expect(results.find(({ status }) => status === 200)?.body).toEqual({ data: { id: target.id, mode } });
    expect(await audits(target.id)).toHaveLength(1);
  });

  it("DELETE chờ transaction nộp attempt rồi ẩn danh và giữ nguyên bài nộp", async () => {
    const target = await kit.makeUser("http-delete-submit");
    let allowCommit!: () => void;
    const held = new Promise<void>((resolve) => { allowCommit = resolve; });
    let pid: number | undefined;
    const submission = prisma.$transaction(async (tx) => {
      const attempt = await tx.attempt.create({ data: { studentId: target.id, exerciseId, answer: ["goes"] } });
      const [connection] = await tx.$queryRaw<[{ pid: number }]>`SELECT pg_backend_pid() AS pid`;
      pid = connection.pid;
      await held;
      return attempt;
    }, { timeout: 8_000 });

    let deletionRequest: ReturnType<typeof remove> | undefined;
    try {
      await vi.waitFor(() => expect(pid).toBeDefined());
      deletionRequest = remove(target.id);
      await vi.waitFor(async () => {
        const [result] = await prisma.$queryRaw<[{ waiting: boolean }]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE ${pid!} = ANY(pg_blocking_pids(pg_stat_activity.pid))
              AND query LIKE '%FOR UPDATE%'
          ) AS waiting
        `;
        expect(result.waiting).toBe(true);
      }, { timeout: 3_000 });
    } finally {
      allowCommit();
      await Promise.allSettled([submission, deletionRequest]);
    }
    const attempt = await submission;
    expect(await deletionRequest).toEqual({ status: 200, body: { data: { id: target.id, mode: "anonymized" } } });
    expect(await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).toEqual(attempt);
    expect(await audits(target.id)).toHaveLength(1);
  }, 10_000);

  it("POST /attempts và DELETE song song cho kết quả nhất quán qua HTTP", async () => {
    const target = await kit.makeUser("http-delete-submit-request");
    const [submission, removal] = await Promise.all([
      post("/attempts", { exerciseId, answer: ["goes"] }, authorizationHeaders(target)),
      remove(target.id),
    ]);
    expect(removal.status).toBe(200);
    const attempts = await prisma.attempt.count({ where: { studentId: target.id, exerciseId } });
    if (submission.status === 201) {
      expect(attempts).toBe(1);
      expect(removal.body).toEqual({ data: { id: target.id, mode: "anonymized" } });
    } else {
      expect([401, 403, 409, 500]).toContain(submission.status);
      expect(submission.body).toMatchObject({ data: null, error: { code: expect.any(String) } });
      expect(attempts).toBe(0);
      expect(removal.body).toEqual({ data: { id: target.id, mode: "deleted" } });
    }
    expect(await audits(target.id)).toHaveLength(1);
  });

  it("chuẩn hóa lỗi hạ tầng thành 500 JSON và không ghi thông tin user ra log", async () => {
    const target = await kit.makeUser("http-delete-private");
    const service = vi.spyOn(deletion, "deleteUser").mockRejectedValueOnce(new Error(`${target.name} ${target.email}`));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expectError(await remove(target.id, adminHeaders, [target.name, target.email]), 500, "INTERNAL_SERVER_ERROR");
      expect(log.mock.calls).toEqual([["INTERNAL_SERVER_ERROR"]]);
      expect(await audits(target.id)).toEqual([]);
    } finally {
      service.mockRestore();
      log.mockRestore();
    }
  });
});