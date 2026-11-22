import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiDailyLimits } from "../../ai/ai.usage";
import { dailyLimitsFromEnv } from "../../ai/ai.usage.config";
import { AI_DAILY_LIMITS_KEY, createAiDailyLimitsReader } from "../../ai/ai.usage.settings";
import { prisma } from "../../config/prisma";
import { authorizationHeaders, createAuthorizationFixtures, startAuthorizationApp } from "../../testing/authorization-fixtures";
import { createPromptTestDb } from "./admin.prompts-db-fixture";

let db: Awaited<ReturnType<typeof createPromptTestDb>>;
let reader: ReturnType<typeof createAiDailyLimitsReader>;

vi.mock("../../ai/ai.usage.settings", async (importOriginal) => {
  const settings = await importOriginal<typeof import("../../ai/ai.usage.settings")>();
  return {
    ...settings,
    getAiDailyLimitsConfig: () => reader.getAiDailyLimitsConfig(),
    invalidateAiDailyLimitsCache: () => reader.invalidateAiDailyLimitsCache(),
  };
});

vi.mock("./admin.ai-limits.service", async (importOriginal) => {
  const service = await importOriginal<typeof import("./admin.ai-limits.service")>();
  return {
    ...service,
    updateAdminAiLimits: (adminId: number, limits: AiDailyLimits) => service.updateAdminAiLimits(adminId, limits, db),
  };
});

type Fixtures = Awaited<ReturnType<typeof createAuthorizationFixtures>>;
type Method = "GET" | "PUT";
let fixtures: Fixtures;
let app: Awaited<ReturnType<typeof startAuthorizationApp>>;
let deletedUserHeaders: ReturnType<typeof authorizationHeaders>;

beforeAll(async () => {
  fixtures = await createAuthorizationFixtures();
  const deleted = fixtures.actors.studentB;
  deletedUserHeaders = authorizationHeaders(deleted);
  await prisma.user.delete({ where: { id: deleted.id } });
  db = await createPromptTestDb(fixtures.actors.admin.id);
  app = await startAuthorizationApp(fixtures.forbiddenValues);
});

beforeEach(async () => {
  await db.$transaction([db.auditLog.deleteMany(), db.promptTemplate.deleteMany()]);
  reader = createAiDailyLimitsReader(db, () => 0);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
  await fixtures?.cleanup();
});

function request(method: Method, auth?: HeadersInit, body?: unknown) {
  const headers = new Headers(auth);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return app.request("/admin/ai-limits", { method, headers, body: JSON.stringify(body) }, {
    forbiddenKeys: ["email", "template", "passwordHash", "password_hash"],
  });
}

function asAdmin(method: Method, body?: unknown) {
  return request(method, authorizationHeaders(fixtures.actors.admin), body);
}

function expectedError(status: number, code: string) {
  return { status, body: { data: null, error: { code, message: expect.any(String) } } };
}

describe.each(["GET", "PUT"] as const)("quyền %s /api/v1/admin/ai-limits", (method) => {
  it("trả 401 khi thiếu token hoặc tài khoản đã bị xóa", async () => {
    const unauthorized = expectedError(401, "UNAUTHORIZED");
    expect(await request(method)).toEqual(unauthorized);
    expect(await request(method, deletedUserHeaders)).toEqual(unauthorized);
  });

  it("trả 401 khi token hết hạn hoặc sai chữ ký", async () => {
    const admin = fixtures.actors.admin;
    const invalidToken = expectedError(401, "INVALID_TOKEN");
    expect(await request(method, authorizationHeaders(admin, -60))).toEqual(invalidToken);
    const wrongKey = jwt.sign({ userId: admin.id }, randomUUID());
    expect(await request(method, { Authorization: `Bearer ${wrongKey}` })).toEqual(invalidToken);
  });

  it.each(["studentA", "teacherA", "pendingTeacher", "lockedTeacher"] as const)("%s nhận 403", async (actor) => {
    expect(await request(method, authorizationHeaders(fixtures.actors[actor])))
      .toEqual(expectedError(403, "FORBIDDEN"));
  });
});

describe("hợp đồng API cấu hình hạn mức AI", () => {
  it("GET dùng env, PUT lưu DB và GET tiếp theo lập tức thấy giá trị mới", async () => {
    const envLimits = dailyLimitsFromEnv();
    expect(await asAdmin("GET")).toEqual({
      status: 200, body: { data: { ...envLimits, source: "env", updated_at: null }, error: null },
    });

    const limits = { student: 1, teacher: 1000 };
    const put = await asAdmin("PUT", limits);
    const row = await db.promptTemplate.findUniqueOrThrow({ where: { key: AI_DAILY_LIMITS_KEY } });
    expect(row.template).toBe(JSON.stringify(limits));
    expect(put).toEqual({
      status: 200,
      body: { data: { ...limits, source: "db", updated_at: row.updatedAt.toISOString() }, error: null },
    });
    expect(await asAdmin("GET")).toEqual(put);
    expect(await db.auditLog.findMany({ select: { userId: true, action: true, detail: true } })).toEqual([{
      userId: fixtures.actors.admin.id, action: "ai_limits.update", detail: { from: envLimits, to: limits },
    }]);
  });

  it.each([
    ["JSON hỏng", "{private_broken_payload"],
    ["JSON sai schema", '{"student":"5","teacher":20}'],
  ])("GET dùng env và chỉ log mã khi %s", async (_kind, template) => {
    await db.promptTemplate.create({ data: { key: AI_DAILY_LIMITS_KEY, template } });
    expect(await asAdmin("GET")).toEqual({
      status: 200, body: { data: { ...dailyLimitsFromEnv(), source: "env", updated_at: null }, error: null },
    });
    expect(vi.mocked(console.warn).mock.calls).toEqual([["AI_LIMITS_CONFIG_INVALID"]]);
  });

  it.each([
    { student: 0, teacher: 20 }, { student: 5, teacher: -1 }, { student: 1.5, teacher: 20 },
    { student: "5", teacher: 20 }, { student: 5, teacher: 1001 }, { teacher: 20 },
    { student: 5, teacher: 20, admin: 30 },
  ])("PUT từ chối body sai %j", async (body) => {
    expect(await asAdmin("PUT", body)).toEqual(expectedError(400, "VALIDATION_ERROR"));
    expect(await db.promptTemplate.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });
});