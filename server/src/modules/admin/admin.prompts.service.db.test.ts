import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildAiCacheKey } from "../../ai/ai.cache";
import { DEFAULT_PROMPTS, PROMPT_KEYS } from "../../ai/prompts/defaults";
import { buildPrompt } from "../../ai/prompts/prompt-templates";
import { createPromptTestDb } from "./admin.prompts-db-fixture";
import { promptTemplateLength } from "./admin.prompts.schema";
import { getAdminPrompt, listAdminPrompts, resetAdminPrompt, updateAdminPrompt } from "./admin.prompts.service";

const definition = DEFAULT_PROMPTS.writing_grade;
const { key } = definition;
const adminId = 42;
const variables = Object.fromEntries(definition.variables.map((name) => [name, `test_${name}`]));
const model = "test-model";
const settingsKey = "settings:ai_daily_limits";

let db: Awaited<ReturnType<typeof createPromptTestDb>>;

beforeAll(async () => {
  db = await createPromptTestDb(adminId);
});

beforeEach(async () => {
  await db.$transaction([db.auditLog.deleteMany(), db.promptTemplate.deleteMany()]);
});

afterAll(async () => {
  await db?.$disconnect();
});

const audits = () => db.auditLog.findMany({
  orderBy: { id: "asc" },
  select: { userId: true, action: true, detail: true },
});

describe("service cấu hình prompt trên PostgreSQL", () => {
  it("chỉ liệt kê metadata của PROMPT_KEYS và trả mẫu mặc định khi chưa có hàng", async () => {
    await db.promptTemplate.create({ data: { key: settingsKey, template: '{"student":10,"teacher":20}' } });
    const list = await listAdminPrompts(db);
    expect(list.map((item) => item.key)).toEqual([...PROMPT_KEYS]);
    expect(list.every((item) => !Object.hasOwn(item, "template"))).toBe(true);
    expect(await getAdminPrompt(key, db)).toEqual({
      key,
      task: definition.task,
      variables: definition.variables,
      required: definition.required,
      is_default: true,
      updated_at: null,
      template: definition.template,
    });
  });

  it("dùng mẫu mới ngay, đổi khóa cache và reset lặp lại giữ nguyên mẫu mặc định", async () => {
    const original = await buildPrompt(key, variables, db);
    const cacheKey = (prompt: string) => buildAiCacheKey(definition.task, model, prompt);
    const suffix = "Dòng thử riêng của mẫu tùy chỉnh 🙂.";
    const template = `${definition.template}\n${suffix}`;

    const updated = await updateAdminPrompt(adminId, key, { template }, db);
    expect(updated).toMatchObject({ key, template, is_default: false, updated_at: expect.any(Date) });
    expect(await getAdminPrompt(key, db)).toEqual(updated);
    const rendered = await buildPrompt(key, variables, db);
    expect(rendered).toContain(suffix);
    expect(cacheKey(rendered)).not.toBe(cacheKey(original));

    const reset = await resetAdminPrompt(adminId, key, db);
    expect(reset).toMatchObject({ key, template: definition.template, is_default: true, updated_at: expect.any(Date) });
    expect(await resetAdminPrompt(adminId, key, db)).toEqual(reset);
    expect(await db.promptTemplate.count({ where: { key } })).toBe(1);
    const restored = await buildPrompt(key, variables, db);
    expect(restored).toBe(original);
    expect(cacheKey(restored)).toBe(cacheKey(original));

    const defaultLength = promptTemplateLength(definition.template);
    const updatedLength = promptTemplateLength(template);
    expect(await audits()).toEqual([
      { userId: adminId, action: "prompt.update", detail: { key, length_before: defaultLength, length_after: updatedLength } },
      { userId: adminId, action: "prompt.reset", detail: { key, length_before: updatedLength, length_after: defaultLength } },
      { userId: adminId, action: "prompt.reset", detail: { key, length_before: defaultLength, length_after: defaultLength } },
    ]);
  });

  it("reset tạo hàng đúng nội dung mặc định khi DB chưa có key", async () => {
    const reset = await resetAdminPrompt(adminId, key, db);
    expect(reset.updated_at).toBeInstanceOf(Date);
    expect(await db.promptTemplate.findUniqueOrThrow({ where: { key }, select: { template: true } }))
      .toEqual({ template: definition.template });
  });

  it("báo cả biến lạ lẫn biến thiếu và không ghi DB", async () => {
    await expect(updateAdminPrompt(adminId, key, { template: "{{ unknown_variable }}" }, db))
      .rejects.toMatchObject({
        code: "PROMPT_INVALID_TEMPLATE",
        variables: ["unknown_variable", ...definition.required],
      });
    expect(await db.promptTemplate.count()).toBe(0);
    expect(await audits()).toEqual([]);
  });

  it.each(["unknown_key", settingsKey, "__proto__"])("từ chối key %s khi đọc, sửa hoặc reset", async (unknownKey) => {
    await expect(getAdminPrompt(unknownKey, db)).rejects.toMatchObject({ code: "PROMPT_NOT_FOUND" });
    await expect(updateAdminPrompt(adminId, unknownKey, { template: definition.template }, db))
      .rejects.toMatchObject({ code: "PROMPT_NOT_FOUND" });
    await expect(resetAdminPrompt(adminId, unknownKey, db)).rejects.toMatchObject({ code: "PROMPT_NOT_FOUND" });
  });

  it("hoàn tác lần ghi đầu và giữ nguyên hàng cũ nếu ghi audit thất bại", async () => {
    const template = `${definition.template}\nGiữ nguyên khi audit lỗi.`;
    const rejectedAdminId = adminId + 1;
    await expect(updateAdminPrompt(rejectedAdminId, key, { template }, db)).rejects.toThrow();
    expect(await db.promptTemplate.findUnique({ where: { key } })).toBeNull();
    expect(await audits()).toEqual([]);

    const saved = await updateAdminPrompt(adminId, key, { template }, db);
    await expect(resetAdminPrompt(rejectedAdminId, key, db)).rejects.toThrow();
    expect(await getAdminPrompt(key, db)).toEqual(saved);
    expect(await audits()).toHaveLength(1);
  });
});