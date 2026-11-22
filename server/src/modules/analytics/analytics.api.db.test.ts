import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma";
import { authorizationHeaders, createAuthorizationFixtures, startAuthorizationApp } from "../../testing/authorization-fixtures";

type Fixtures = Awaited<ReturnType<typeof createAuthorizationFixtures>>;
let fixtures: Fixtures;
let app: Awaited<ReturnType<typeof startAuthorizationApp>>;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error("Không kết nối được PostgreSQL. Kiểm tra DATABASE_URL trước khi chạy test API thống kê.");
  }

  fixtures = await createAuthorizationFixtures();
  const emails = Object.values(fixtures.actors).map((actor) => actor.email);
  app = await startAuthorizationApp([...fixtures.forbiddenValues, ...emails]);
});

afterAll(async () => {
  await app?.close();
  await fixtures?.cleanup();
});

function request(query = "", headers?: HeadersInit) {
  return app.request(`/analytics/overview${query}`, { headers }, {
    forbiddenKeys: ["email", "passwordHash", "password_hash", "answer", "content"],
  });
}

function expectedError(status: number, code: string) {
  return { status, body: { data: null, error: { code, message: expect.any(String) } } };
}

describe("GET /api/v1/analytics/overview", () => {
  it.each(["", "?days=1", "?days=90"])("ADMIN nhận thống kê với query %j", async (query) => {
    const response = await request(query, authorizationHeaders(fixtures.actors.admin));
    expect(response).toEqual({
      status: 200,
      body: {
        data: {
          users: expect.any(Object),
          classes: { total: expect.any(Number) },
          assignments: { total: expect.any(Number), open: expect.any(Number) },
          exercises: expect.any(Object),
          attempts: expect.any(Object),
          ai_usage: expect.any(Object),
          reports: expect.any(Object),
        },
        error: null,
      },
    });
  });

  it.each(["0", "91", "abc"])("ADMIN nhận 400 khi days = %s", async (days) => {
    const response = await request(`?days=${days}`, authorizationHeaders(fixtures.actors.admin));
    expect(response).toEqual(expectedError(400, "VALIDATION_ERROR"));
  });

  it("trả 401 khi thiếu token", async () => {
    expect(await request()).toEqual(expectedError(401, "UNAUTHORIZED"));
  });

  it("trả 401 khi token hết hạn hoặc sai chữ ký", async () => {
    const admin = fixtures.actors.admin;
    expect(await request("", authorizationHeaders(admin, -60))).toEqual(expectedError(401, "INVALID_TOKEN"));

    const badSignature = jwt.sign({ userId: admin.id }, randomUUID());
    expect(await request("", { Authorization: `Bearer ${badSignature}` })).toEqual(expectedError(401, "INVALID_TOKEN"));
  });

  it("trả 401 khi tài khoản trong token đã bị xóa", async () => {
    const user = await prisma.user.create({
      data: {
        name: "T26 Deleted Admin",
        email: `t26-deleted-${randomUUID()}@example.test`,
        passwordHash: "unused-in-this-test",
        role: "ADMIN",
      },
      select: { id: true },
    });
    const headers = authorizationHeaders(user);
    await prisma.user.delete({ where: { id: user.id } });

    expect(await request("", headers)).toEqual(expectedError(401, "UNAUTHORIZED"));
  });

  it.each(["studentA", "teacherA", "pendingTeacher", "lockedTeacher"] as const)(
    "%s nhận 403 trước khi kiểm tra days",
    async (actor) => {
      const response = await request("?days=abc", authorizationHeaders(fixtures.actors[actor]));
      expect(response).toEqual(expectedError(403, "FORBIDDEN"));
    }
  );
});