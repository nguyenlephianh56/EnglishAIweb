import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROMPTS, PROMPT_KEYS } from "../../ai/prompts/defaults";
import { prisma } from "../../config/prisma";
import { authorizationHeaders, createAuthorizationFixtures, startAuthorizationApp } from "../../testing/authorization-fixtures";
import { createPromptTestDb } from "./admin.prompts-db-fixture";
import { promptTemplateLength, type UpdatePromptTemplateBody } from "./admin.prompts.schema";

let promptDb: Awaited<ReturnType<typeof createPromptTestDb>>;

vi.mock("./admin.prompts.service", async (importOriginal) => {
  const service = await importOriginal<typeof import("./admin.prompts.service")>();
  // Handler thật gọi service thật, với bảng prompt và audit tạm của test.
  return {
    ...service,
    listAdminPrompts: () => service.listAdminPrompts(promptDb),
    getAdminPrompt: (key: string) => service.getAdminPrompt(key, promptDb),
    updateAdminPrompt: (adminId: number, key: string, body: UpdatePromptTemplateBody) =>
      service.updateAdminPrompt(adminId, key, body, promptDb),
    resetAdminPrompt: (adminId: number, key: string) => service.resetAdminPrompt(adminId, key, promptDb),
  };
});

type Fixtures = Awaited<ReturnType<typeof createAuthorizationFixtures>>;
type Method = "GET" | "PUT" | "POST";
let fixtures: Fixtures;
let app: Awaited<ReturnType<typeof startAuthorizationApp>>;
let deletedUserHeaders: ReturnType<typeof authorizationHeaders>;
const definition = DEFAULT_PROMPTS.writing_grade;
const path = `/${definition.key}`;
const settingsKey = "settings:ai_daily_limits";

beforeAll(async () => {
  fixtures = await createAuthorizationFixtures();
  const deleted = fixtures.actors.studentB;
  deletedUserHeaders = authorizationHeaders(deleted);
  await prisma.user.delete({ where: { id: deleted.id } });
  promptDb = await createPromptTestDb(fixtures.actors.admin.id);
  app = await startAuthorizationApp(fixtures.forbiddenValues);
});

beforeEach(async () => {
  await promptDb.$transaction([promptDb.auditLog.deleteMany(), promptDb.promptTemplate.deleteMany()]);
});

afterAll(async () => {
  await app?.close();
  await promptDb?.$disconnect();
  await fixtures?.cleanup();
});

function request(method: Method, suffix: string, auth?: HeadersInit, body?: unknown) {
  const headers = new Headers(auth);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return app.request(`/admin/prompts${suffix}`, { method, headers, body: JSON.stringify(body) }, {
    forbiddenKeys: ["email", "passwordHash", "password_hash"],
  });
}

function asAdmin(method: Method, suffix = "", body?: unknown) {
  return request(method, suffix, authorizationHeaders(fixtures.actors.admin), body);
}

function expectedError(status: number, code: string, message = expect.any(String)) {
  return { status, body: { data: null, error: { code, message } } };
}

const routes = [
  { method: "GET", suffix: "" },
  { method: "GET", suffix: path },
  { method: "PUT", suffix: path },
  { method: "POST", suffix: `${path}/reset` },
] as const;

describe.each(routes)("quyền $method /api/v1/admin/prompts$suffix", ({ method, suffix }) => {
  it("trả 401 khi thiếu token hoặc tài khoản đã bị xóa", async () => {
    const unauthorized = expectedError(401, "UNAUTHORIZED");
    expect(await request(method, suffix)).toEqual(unauthorized);
    expect(await request(method, suffix, deletedUserHeaders)).toEqual(unauthorized);
  });

  it("trả 401 khi token hết hạn hoặc sai chữ ký", async () => {
    const admin = fixtures.actors.admin;
    const invalidToken = expectedError(401, "INVALID_TOKEN");
    expect(await request(method, suffix, authorizationHeaders(admin, -60))).toEqual(invalidToken);
    const wrongKey = jwt.sign({ userId: admin.id }, randomUUID());
    expect(await request(method, suffix, { Authorization: `Bearer ${wrongKey}` })).toEqual(invalidToken);
  });

  it.each(["studentA", "teacherA", "pendingTeacher", "lockedTeacher"] as const)("%s nhận 403", async (actor) => {
    expect(await request(method, suffix, authorizationHeaders(fixtures.actors[actor])))
      .toEqual(expectedError(403, "FORBIDDEN"));
  });
});

describe("hợp đồng API cấu hình prompt", () => {
  it("GET danh sách chỉ trả metadata của PROMPT_KEYS và GET chi tiết trả mẫu hiện hành", async () => {
    await promptDb.promptTemplate.create({ data: { key: settingsKey, template: '{"student":10,"teacher":20}' } });
    const list = PROMPT_KEYS.map((key) => ({
      key,
      task: DEFAULT_PROMPTS[key].task,
      variables: DEFAULT_PROMPTS[key].variables,
      required: DEFAULT_PROMPTS[key].required,
      is_default: true,
      updated_at: null,
    }));

    expect(await asAdmin("GET")).toEqual({ status: 200, body: { data: list, error: null } });
    expect(await asAdmin("GET", path)).toEqual({
      status: 200,
      body: { data: { ...list.find((item) => item.key === definition.key), template: definition.template }, error: null },
    });
  });

  it.each(["unknown_key", settingsKey, "__proto__"])("trả cùng 404 cho key %s", async (key) => {
    const suffix = `/${encodeURIComponent(key)}`;
    const notFound = expectedError(404, "PROMPT_NOT_FOUND", "Không tìm thấy mẫu prompt");
    expect(await asAdmin("GET", suffix)).toEqual(notFound);
    expect(await asAdmin("PUT", suffix, {})).toEqual(notFound);
    expect(await asAdmin("POST", `${suffix}/reset`)).toEqual(notFound);
  });

  it("PUT trả 400 kèm tên biến lạ và biến bắt buộc còn thiếu", async () => {
    const privateText = "Nội dung mẫu riêng của ca kiểm thử";
    const result = await asAdmin("PUT", path, { template: `${privateText}\n{{ unknown_variable }}` });
    expect(result).toEqual({
      status: 400,
      body: { data: null, error: {
        code: "PROMPT_INVALID_TEMPLATE",
        message: expect.any(String),
        details: { variables: ["unknown_variable", ...definition.required] },
      } },
    });
    expect(JSON.stringify(result)).not.toContain(privateText);
    expect(await promptDb.auditLog.count()).toBe(0);
  });

  it("từ chối body sai và mẫu quá dài", async () => {
    const invalid = expectedError(400, "VALIDATION_ERROR");
    for (const body of [{}, { template: "" }, { template: "a".repeat(20_001) }, { template: definition.template, extra: true }]) {
      expect(await asAdmin("PUT", path, body)).toEqual(invalid);
    }
    expect(await asAdmin("POST", `${path}/reset`, { template: definition.template })).toEqual(invalid);
    expect(await promptDb.auditLog.count()).toBe(0);
  });

  it("PUT lưu mẫu, reset lặp lại giữ mặc định và audit chỉ chứa metadata", async () => {
    const template = `${definition.template}\nHướng dẫn riêng của fixture 🙂.`;
    const updated = await asAdmin("PUT", path, { template });
    expect(updated).toMatchObject({
      status: 200,
      body: { data: { key: definition.key, template, is_default: false, updated_at: expect.any(String) }, error: null },
    });
    expect(await asAdmin("GET", path)).toEqual(updated);

    const reset = await asAdmin("POST", `${path}/reset`);
    expect(reset).toMatchObject({
      status: 200,
      body: { data: { key: definition.key, template: definition.template, is_default: true }, error: null },
    });
    expect(await asAdmin("POST", `${path}/reset`, {})).toEqual(reset);
    expect(await asAdmin("GET", path)).toEqual(reset);

    const standardLength = promptTemplateLength(definition.template);
    const storedLength = promptTemplateLength(template);
    const userId = fixtures.actors.admin.id;
    const key = definition.key;
    expect(await promptDb.auditLog.findMany({
      orderBy: { id: "asc" }, select: { userId: true, action: true, detail: true },
    })).toEqual([
      { userId, action: "prompt.update", detail: { key, length_before: standardLength, length_after: storedLength } },
      { userId, action: "prompt.reset", detail: { key, length_before: storedLength, length_after: standardLength } },
      { userId, action: "prompt.reset", detail: { key, length_before: standardLength, length_after: standardLength } },
    ]);
  });
});