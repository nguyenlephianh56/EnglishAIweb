import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma";
import { authorizationHeaders, createAuthorizationFixtures, startAuthorizationApp } from "../../testing/authorization-fixtures";

type Fixtures = Awaited<ReturnType<typeof createAuthorizationFixtures>>;
let fixtures: Fixtures;
let app: Awaited<ReturnType<typeof startAuthorizationApp>>;
let deletedUserHeaders: ReturnType<typeof authorizationHeaders>;
let orphanAuditId: number;
const seededAuditIds: number[] = [];
const scope = `t26_${randomUUID().replaceAll("-", "")}`;
const orphanAction = `${scope}.deleted`;
const from = new Date("2026-11-22T08:00:00.000Z");
const to = new Date("2026-11-22T10:00:00.000Z");
const privateToken = "t26-private-audit-token";

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error("Không kết nối được PostgreSQL. Kiểm tra DATABASE_URL trước khi chạy test API audit.");
  }

  fixtures = await createAuthorizationFixtures();
  const deleted = fixtures.actors.studentB;
  deletedUserHeaders = authorizationHeaders(deleted);
  orphanAuditId = await seedAudit(deleted.id, orphanAction, from, { target_user_id: 42 });
  await prisma.user.delete({ where: { id: deleted.id } });

  app = await startAuthorizationApp([...fixtures.forbiddenValues, privateToken]);
});

afterAll(async () => {
  await app?.close();
  if (!fixtures) return;
  await prisma.auditLog.deleteMany({
    where: { OR: [{ id: { in: seededAuditIds } }, { userId: fixtures.actors.admin.id }] },
  });
  await fixtures.cleanup();
});

async function seedAudit(userId: number, action: string, createdAt: Date, detail?: Prisma.InputJsonValue) {
  const row = await prisma.auditLog.create({
    data: { userId, action, createdAt, detail },
    select: { id: true },
  });
  seededAuditIds.push(row.id);
  return row.id;
}

function request(query = "", headers?: HeadersInit) {
  return app.request(`/admin/audit-logs${query}`, { headers }, {
    forbiddenKeys: ["email", "answer", "content", "token", "authorization", "api_key"],
    forbiddenValues: Object.values(fixtures.actors).map((actor) => actor.email),
  });
}

function asAdmin(query = "") {
  return request(query, authorizationHeaders(fixtures.actors.admin));
}

function expectedError(status: number, code: string) {
  return { status, body: { data: null, error: { code, message: expect.any(String) } } };
}

describe("GET /api/v1/admin/audit-logs", () => {
  it("trả 401 khi thiếu token hoặc tài khoản đã bị xóa", async () => {
    expect(await request()).toEqual(expectedError(401, "UNAUTHORIZED"));
    expect(await request("", deletedUserHeaders)).toEqual(expectedError(401, "UNAUTHORIZED"));
  });

  it("trả 401 khi token hết hạn hoặc sai chữ ký", async () => {
    const admin = fixtures.actors.admin;
    expect(await request("", authorizationHeaders(admin, -60))).toEqual(expectedError(401, "INVALID_TOKEN"));
    const wrongKey = jwt.sign({ userId: admin.id }, randomUUID());
    expect(await request("", { Authorization: `Bearer ${wrongKey}` })).toEqual(expectedError(401, "INVALID_TOKEN"));
  });

  it.each(["studentA", "teacherA", "pendingTeacher", "lockedTeacher"] as const)(
    "%s nhận 403 trước khi kiểm tra query",
    async (actor) => {
      expect(await request("?limit=0", authorizationHeaders(fixtures.actors[actor])))
        .toEqual(expectedError(403, "FORBIDDEN"));
    }
  );

  it.each([
    "?action=approve", "?limit=0", "?limit=101", "?user_id=0", "?cursor=abc",
    "?from=2026-11-23T00:00:00Z&to=2026-11-22T00:00:00Z",
  ])("ADMIN nhận 400 với query %s", async (query) => {
    expect(await asAdmin(query)).toEqual(expectedError(400, "VALIDATION_ERROR"));
  });

  it("áp dụng bộ lọc, trả đúng cursor và che dữ liệu nhạy cảm", async () => {
    const action = `${scope}.update`;
    const { teacherA, teacherB } = fixtures.actors;
    const older = await seedAudit(teacherA.id, action, from);
    const newer = await seedAudit(teacherA.id, action, to, {
      email: teacherA.email,
      nested: [{ authorization: privateToken, answer: [1], keep: true }],
    });
    await seedAudit(teacherA.id, action, new Date(to.getTime() + 1));
    await seedAudit(teacherA.id, `${action}_extra`, to);
    await seedAudit(teacherB.id, action, to);

    const query = new URLSearchParams({
      action,
      user_id: String(teacherA.id),
      from: "2026-11-22T15:00:00+07:00",
      to: to.toISOString(),
      limit: "1",
    });
    const user = { id: teacherA.id, name: "Teacher A" };

    expect(await asAdmin(`?${query}`)).toEqual({
      status: 200,
      body: { data: { items: [{
        id: newer, action, user, detail: { nested: [{ keep: true }] }, created_at: to.toISOString(),
      }], next_cursor: newer }, error: null },
    });
    query.set("cursor", String(newer));
    expect(await asAdmin(`?${query}`)).toEqual({
      status: 200,
      body: { data: { items: [{
        id: older, action, user, detail: null, created_at: from.toISOString(),
      }], next_cursor: null }, error: null },
    });
  });

  it("trả user null trên dòng audit của tài khoản đã bị xóa", async () => {
    expect(await asAdmin(`?action=${orphanAction}`)).toEqual({
      status: 200,
      body: { data: { items: [{
        id: orphanAuditId, action: orphanAction, user: null,
        detail: { target_user_id: 42 }, created_at: from.toISOString(),
      }], next_cursor: null }, error: null },
    });
  });

  it.each([
    ["approve", "pendingTeacher", "PENDING", "ACTIVE"],
    ["lock", "teacherB", "ACTIVE", "LOCKED"],
    ["unlock", "lockedTeacher", "LOCKED", "ACTIVE"],
  ] as const)("hiển thị audit user.%s từ thao tác HTTP của ADMIN", async (operation, account, fromStatus, toStatus) => {
    const admin = fixtures.actors.admin;
    const target = fixtures.actors[account];
    const action = `user.${operation}`;
    try {
      const mutation = await app.request(`/admin/users/${target.id}/${operation}`, {
        method: "PATCH", headers: authorizationHeaders(admin),
      });
      expect(mutation.status).toBe(200);
      expect(mutation.body).toMatchObject({ data: { id: target.id, status: toStatus }, error: null });

      expect(await asAdmin(`?action=${action}&user_id=${admin.id}`)).toEqual({
        status: 200,
        body: { data: { items: [{
          id: expect.any(Number), action, user: { id: admin.id, name: "Admin" },
          detail: { target_user_id: target.id, from: fromStatus, to: toStatus },
          created_at: expect.any(String),
        }], next_cursor: null }, error: null },
      });
    } finally {
      await prisma.user.update({ where: { id: target.id }, data: { status: fromStatus } });
    }
  });
});